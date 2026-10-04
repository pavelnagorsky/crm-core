# Multi-Service Booking — Implementation Plan

> **Status:** design complete, ready for implementation.
> **Audience:** the engineer/LLM implementing this. Read the whole document before writing code.
> **Goal:** reach feature parity with YCLIENTS "комплексы (4 руки)" — one appointment can contain several services, performed by one or several staff, sequentially or in parallel — **without** splitting the product into "buy a service" vs "buy a combo" as two separate sale types.

---

## 0. Guiding product + architecture decisions (READ FIRST)

These decisions were made deliberately. Do not silently deviate from them.

### 0.1 Unified model — a booking is always a list of items

There is **no** special "combo booking" type. Every booking — a single haircut or a 3-service combo "in 4 hands" — is the **same shape**: a `Booking` container holding **1..N `BookingItem`** rows. A single-service booking is just the degenerate case `N = 1`.

Consequences that MUST hold:
- Calendar, search, export, payroll, notifications, audit all treat a booking uniformly as "container + items". None of them branch on "is this a combo".
- The current flat snapshot fields on `Booking` (`serviceId`, `serviceTitle`, `serviceDuration`, `servicePrice`, `customPrice`, `staffId`, `staffName`) **move to `BookingItem`**. `Booking` keeps only visit-level data.
- Buying a combo and buying a single service go through the **same create endpoint** with the same DTO shape.

### 0.2 Two layers: the catalog (what's offered) vs the booking (what was sold)

- **Catalog layer** — what a business configures and what a client browses. Services + *bundles* (pre-configured combos) live here.
- **Booking layer** — the realized sale: `Booking` + `BookingItem[]` snapshots. Snapshots are immutable copies taken at creation time (same denormalization philosophy already used by the current `Booking`).

A **bundle** (YCLIENTS "комплекс") is a *catalog* concept: a named, pre-priced package. When booked, it **explodes into `BookingItem` rows** — the booking layer never stores "a bundle", only its resulting items (plus a back-reference `bundleId` for reporting). This is what makes ad-hoc multi-service and pre-configured bundles the *same* at the booking layer.

### 0.3 Catalog unification — services and bundles share pages/tables

Per the product owner's explicit requirement: services and bundles must be **created on the same screens and listed in the same tables** where feasible. **Decision (final, see §2.2):** at the DB level a bundle is a *separate* `ServiceBundle` table (not a column on `Service`); the unification is delivered at the **API/read-model layer** — a merged catalog endpoint (§4.3) returns both kinds tagged by a `kind` discriminator (`SERVICE` | `BUNDLE`), so one UI page/table manages both. The `kind` discriminator exists only in the read-model DTO, never as a column on `Service`.

### 0.4 Scope: both execution modes are IN scope

Target niches are broad ("как YCLIENTS"), including nail studios / spas. Therefore **both** modes ship:
- `SEQUENTIAL` — items run back-to-back (one staff for all, or different staff per item).
- `PARALLEL` — items run at the same time, each with its own staff ("4 hands").

The expensive, highest-risk part is the **slot search across N staff** (§6). Budget for it.

### 0.5 Client booking flow — backend decides, frontend renders

The frontend never computes "can this staff do these services". There is **one generic resolve endpoint** (§7) that takes the current partial selection and returns what is still valid. The form offers both entry orders (pick services first, or pick staff first) — no business-level config for step order. The resolve endpoint is symmetric:
- staff chosen → return only services that staff can perform (incl. bundles fully coverable by them);
- services chosen → return only staff that can perform the whole set; if none can, the staff step is suppressed and the server auto-assigns staff.

### 0.6 Staffing is resolved server-side; `staffId` lives on the item

`BookingItem.staffId` is the source of truth for who performs each item. For public bookings the client sends services (+ optionally a preferred staff when a single staff covers everything); the **server assigns** `staffId` per item during slot resolution. For manual (admin) bookings the admin may assign staff per item explicitly.

### 0.7 Non-negotiable repo conventions (from CLAUDE.md)

- One class/enum/interface per file, in the correct folder (`dto/`, `interfaces/`, `enums/`, `guards/`, `decorators/`, `pipes/`).
- No inline enums/interfaces in services or controllers.
- Domain errors → add a pair to `ErrorCode` (`src/shared/validation/error-codes.enum.ts`) and `throw new AppException(ErrorCode.X, HttpStatus.Y)`. Never subclass `AppException`, never pass a message string.
- Prisma error codes via `PrismaErrorCode`. Regexes via `src/shared/regular-expressions.ts`.
- **Domain ownership:** a module owns its tables; cross-domain data goes through the owning service's named methods, never by querying another domain's tables. `StaffService` owns `staff`/`staffService`; `CalendarService` owns `calendarEvent`; `BookingCreateService` owns `business`/`service`/`booking` (now also `bookingItem`, `serviceBundle*`). `CalendarComputeService` stays a private pure helper.
- Services return Prisma models; DTO mapping happens in controllers. All responses wrapped in `BaseResponseDto.success(...)`. Paginated endpoints extend `PaginationRequestDto`/`PaginationResponseDto`. DELETE → 204, `Promise<void>`.
- Commit/branch naming: `feature/multi-service-booking` etc.

---

## 1. Domain analysis (think like the business)

Why this matters and what real businesses actually do — so the implementer understands the "why", not just the "what".

- **Barbershops / classic salons (the ~90% case):** several services back-to-back with **one** staff ("haircut + beard"). Client often deliberately picks *their* master. → `SEQUENTIAL`, single staff. The slot is one continuous interval — fits the current engine almost unchanged.
- **Salons with specialist split:** "haircut + complex coloring" where the colorist is a different person. → `SEQUENTIAL`, different staff per item; the client should NOT have to pick staff — the system chains available masters.
- **Nail studios / spas ("4 hands"):** "manicure + pedicure" at the same time, two masters. → `PARALLEL`; show only slots where **both** are free.

Business truths that shaped the model:
1. A combo's price is often **not** the sum of parts — businesses discount combos, or set a fixed combo price, or let it be computed. (YCLIENTS: combo price = sum / fixed / computed, with special rules for zero-priced members.) → bundles need a **pricing policy**, not just a service list.
2. Duration and even price can depend on **which staff** performs an item (per-staff service duration/price is a known YCLIENTS feature). Out of scope for v1 but the model must not make it impossible later (see §11).
3. "Buying a combo" must feel like "buying services" to staff — same calendar, same receipt, same payroll. No parallel universe of combo-only reports.

---

## 2. Target data model (Prisma)

> All new models follow existing style (uuid PKs, `@db` sizing, explicit indexes, cascade rules mirrored from siblings).

### 2.1 New enums (each its own file under the owning module's `enums/`, plus Prisma enum)

- `BookingExecutionMode { SEQUENTIAL, PARALLEL }` — how a booking's items are scheduled.
- `CatalogItemKind { SERVICE, BUNDLE }` — discriminator for the unified catalog **read-model DTO only** (§4.3). It is NOT a DB column; services and bundles are separate tables (§2.2). This enum tags merged catalog rows in API responses.
- `BundlePricingMode { SUM, FIXED }` — how a bundle's **list price** is derived: `SUM` of member list prices, or `FIXED` explicit amount. **Both are list prices, not discounts.** `FIXED` means "the business sells this combo at this price" (its own list price), NOT "a discount off the sum" — do not model it as a discount, do not compute/display a "you saved X". Discounts are a **separate future layer** (§11.1), never baked into the catalog. (No `COMPUTED`/per-member-override mode — that would be a discount baked into the service, which is explicitly rejected.)

### 2.2 Catalog: how to represent a bundle (DECISION)

**Chosen: a separate `ServiceBundle` table + `ServiceBundleItem` join, NOT a `kind` column on `Service`.**

Rationale (architect's call): a `Service` row carries a single `durationMinutes`/`price` and is referenced all over (staffServices, commission rates, bookings). Overloading it with a nullable "members" relation and making half its columns meaningless for bundles creates a pervasive "is this really a service?" smell and risks every existing query. A dedicated table keeps `Service` clean and lets bundles have their own fields (pricing mode, execution mode, member list). The **unification the product owner wants is achieved at the API/UI layer** (§4.3), not by forcing one table — the catalog list endpoint returns a unified view over both.

```prisma
enum BundlePricingMode { SUM FIXED }
enum BookingExecutionMode { SEQUENTIAL PARALLEL }

model ServiceBundle {
  id              String               @id @default(uuid())
  businessId      String
  categoryId      String?
  imageFileId     String?
  title           String               @db.VarChar(150)
  description     String?              @db.VarChar(2000)
  executionMode   BookingExecutionMode @default(SEQUENTIAL)
  pricingMode     BundlePricingMode    @default(SUM)
  fixedPrice      Decimal?             @db.Decimal(10, 2) // required iff pricingMode = FIXED
  status          ServiceStatus        @default(ACTIVE)
  sortOrder       Int                  @default(0)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  business  Business            @relation(fields: [businessId], references: [id], onDelete: Cascade)
  category  ServiceCategory?    @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  imageFile File?               @relation(fields: [imageFileId], references: [id], onDelete: SetNull)
  items     ServiceBundleItem[]

  @@index([businessId])
  @@index([categoryId])
}

model ServiceBundleItem {
  id              String  @id @default(uuid())
  bundleId        String
  serviceId       String
  sortOrder       Int     @default(0)

  bundle  ServiceBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  service Service       @relation(fields: [serviceId], references: [id], onDelete: Restrict)

  @@unique([bundleId, serviceId])
  @@index([bundleId])
  @@index([serviceId])
}
```

> No `priceOverride` on the member: a member never carries a per-combo adjusted price. A bundle's list price is either the plain `SUM` of member list prices or a single `FIXED` amount. Any deviation from list price (coupons, promotions, seasonal, happy-hour, per-order discounts) is the future pricing layer's job (§11.1), applied over `BookingItem` at order time — never stored on the catalog.

Add inverse relations to `Business`, `ServiceCategory`, `File`, `Service` (`bundleItems ServiceBundleItem[]`).

> **Note on "same tables" requirement:** the catalog *list/search* API returns services and bundles merged into one paginated, filterable view (§4.3). The DB keeps them separate; the unification is a read-model concern. This satisfies "manage and view in one place" without corrupting `Service`.

### 2.3 Booking layer: container + items

```prisma
model Booking {
  id              String               @id @default(uuid())
  businessId      String
  clientId        String
  // visit envelope — min(item.startAt) .. max(item.endAt)
  startAt         DateTime
  endAt           DateTime
  executionMode   BookingExecutionMode @default(SEQUENTIAL)
  bundleId        String?              // set when this booking originated from a catalog bundle (reporting only)
  status          BookingStatus        @default(CONFIRMED)
  source          BookingSource
  bookingPageId   String?
  bookingWidgetId String?

  // client snapshot (unchanged)
  clientFirstName String  @db.VarChar(100)
  clientLastName  String  @db.VarChar(100)
  clientPhone     String  @db.VarChar(30)
  clientEmail     String? @db.VarChar(254)

  // visit-level notes (unchanged)
  notes         String? @db.VarChar(1000)
  internalNotes String? @db.VarChar(2000)

  cancellationReason String?      @db.VarChar(1000)
  cancelledBy        CancelledBy?
  cancelledAt        DateTime?
  reminderSentAt     DateTime?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  business Business      @relation(...)
  client   Client        @relation(...)
  bundle   ServiceBundle? @relation(...)        // onDelete: SetNull
  items    BookingItem[]
  bookingPage   BookingPage?   @relation(...)
  bookingWidget BookingWidget? @relation(...)

  @@index([businessId, deletedAt, startAt])
  @@index([clientId, deletedAt, startAt])
  @@index([status])
  @@index([bookingPageId])
  @@index([bookingWidgetId])
}

model BookingItem {
  id              String   @id @default(uuid())
  bookingId       String
  businessId      String   // denormalized for direct per-item queries (search/payroll/calendar)
  serviceId       String
  staffId         String
  sortOrder       Int      @default(0)

  // per-item time window (within the visit)
  startAt         DateTime
  endAt           DateTime

  // snapshots (moved off Booking)
  serviceTitle    String   @db.VarChar(150)
  serviceDuration Int
  // Price is split into three roles so a future pricing/discount layer (§11.1)
  // can lay on top without a schema rewrite:
  //   listPrice    = catalog list price at booking time (service price, or bundle-member share)
  //   chargedPrice = what the client actually pays for this item (== listPrice until a
  //                  discount/coupon/policy or admin override changes it)
  //   customPrice  = explicit admin override on this specific booking (highest precedence)
  // Effective charged amount = customPrice ?? chargedPrice. Commission (§9) bases on that.
  listPrice       Decimal  @db.Decimal(10, 2)
  chargedPrice    Decimal  @db.Decimal(10, 2)
  customPrice     Decimal? @db.Decimal(10, 2)
  staffName       String   @db.VarChar(250)

  // one calendar event per item (each item occupies one staff's time)
  calendarEventId String? @unique

  booking       Booking        @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  business      Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  service       Service        @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  staff         Staff          @relation(fields: [staffId], references: [id], onDelete: Restrict)
  calendarEvent CalendarEvent? @relation(fields: [calendarEventId], references: [id], onDelete: SetNull)
  earnings      StaffEarning[]

  @@index([bookingId])
  @@index([businessId, deletedAt_via_booking_note]) // see note
  @@index([staffId, startAt])
  @@index([serviceId])
}
```

> **Index note:** `BookingItem` has no `deletedAt` (soft-delete lives on `Booking`). Per-staff calendar/search queries filter `booking.deletedAt = null` via the relation; add `@@index([staffId, startAt])` and rely on join filtering, or denormalize a `canceledAt`/`deletedAt` onto the item if profiling shows it's needed. Decide during implementation with a quick query-plan check.

Key relational changes vs today:
- `StaffEarning.bookingId` → add `bookingItemId` (nullable during migration, then the primary link). Earnings are now **per item** (§8).
- `CalendarEvent` previously had `booking Booking?` (one-to-one via `Booking.calendarEventId`). Now the link is **`CalendarEvent` ↔ `BookingItem`** one-to-one. Remove `Booking.calendarEventId`; add the relation on `BookingItem`. A `PARALLEL` booking with 2 staff creates 2 calendar events; a `SEQUENTIAL` 3-item single-staff booking creates 3 events (or 1 — see §6.5 decision).

---

## 3. Migration (data-safe, highest-care step #1)

Order within the single Prisma migration (`src/database/migrations/<ts>_multi_service_booking/`):

1. Create enums `BookingExecutionMode`, `BundlePricingMode`.
2. Create tables `ServiceBundle`, `ServiceBundleItem`, `BookingItem`.
3. Add `Booking.executionMode` (default `SEQUENTIAL`), `Booking.bundleId` (nullable). Keep old `Booking.*` service/staff columns **temporarily**.
4. **Backfill:** for every existing `Booking`, insert one `BookingItem` copying `serviceId, staffId, serviceTitle, serviceDuration, staffName, startAt, endAt, calendarEventId`; map the old `servicePrice` → **both** `listPrice` and `chargedPrice` (no historical discount existed); copy `customPrice`; `sortOrder = 0`; `businessId` copied. Set `BookingItem.bookingId` accordingly.
5. Add `StaffEarning.bookingItemId`; backfill by matching each earning's `bookingId` to that booking's single migrated item.
6. Re-point `CalendarEvent` ↔ `BookingItem`: the migrated item takes over the old `Booking.calendarEventId`.
7. **Only after backfill verified:** drop `Booking.serviceId/serviceTitle/serviceDuration/servicePrice/customPrice/staffId/staffName/calendarEventId`. (Consider shipping the drop as a *follow-up* migration once the new code is live and verified in staging — safer rollback. Recommended: two-phase.)

Write the backfill as raw SQL inside the migration (the repo already hand-writes SQL migrations). Add a verification query (count of bookings == count of migrated items) to the PR description / a one-off script. **Never** run `prisma db push` against data; use a proper migration file. Do not auto-apply — the maintainer runs migrations (see repo `db:migrate`).

---

## 4. Catalog module changes (create / edit / list — services + bundles)

### 4.1 Services CRUD — unchanged in shape

`CreateServiceDto`, `UpdateServiceDto`, `ServicesService.create/update/...` stay as-is. A service remains an atomic catalog unit.

### 4.2 Bundle CRUD — new, mirrors services

New, following the services patterns exactly:
- DTOs: `CreateServiceBundleDto`, `UpdateServiceBundleDto`, `ServiceBundleResponseDto`, `ServiceBundleItemDto` (member: `serviceId`, `sortOrder`), `ServiceBundleSearchRequestDto`/`...ResponseDto` if bundles get their own list, plus status-change DTO mirroring `UpdateServiceStatusDto`.
- Service: `ServiceBundleService` (or methods on `ServicesService` — see §4.4) with `create/update/findById/search/changeStatus/delete`.
- Validation rules:
  - 2..N members (`N` = const, default 10 — add `MULTI_SERVICE_MAX_ITEMS` constant, not inline).
  - All member `serviceId`s belong to the business and are `ACTIVE` (reuse `ServicesService.assertIdsInBusiness`).
  - `pricingMode = FIXED` ⇒ `fixedPrice` required; `pricingMode = SUM` ⇒ `fixedPrice` must be null.
  - `executionMode = PARALLEL` ⇒ at least 2 distinct staff must be *possible* (soft check; hard feasibility is at booking time).
- **Title uniqueness:** `Service` today has **no** unique constraint on `title` (only `ServiceCategory` is unique per business). For consistency, `ServiceBundle` also does **not** enforce unique title in v1 — drop `BUNDLE_TITLE_EXISTS`. (If product later wants unique catalog titles, that's a separate decision spanning both tables.)
- Error codes (add to `ErrorCode`): `BUNDLE_NOT_FOUND`, `BUNDLE_MEMBER_SERVICE_NOT_FOUND`, `BUNDLE_TOO_FEW_ITEMS`, `BUNDLE_TOO_MANY_ITEMS`, `BUNDLE_FIXED_PRICE_REQUIRED`, `BUNDLE_IN_USE` (FK on delete).
- Audit: add `AuditEntity.SERVICE` reuse or a new `AuditEntity.BUNDLE` + `BUNDLE_CREATED/UPDATED/DELETED` audit events (follow the service audit field pattern in `src/modules/audit/fields/`).

### 4.3 Unified catalog list (satisfies "same tables/pages")

Add a **catalog read-model** endpoint that returns services and bundles merged:
- `GET /businesses/:id/catalog` (and/or extend the existing services search) returning rows with a `kind: CatalogItemKind` discriminator, shared columns (`title`, `categoryId`, `price` [computed for bundles], `durationMinutes` [summed for bundles], `status`, `sortOrder`), and `memberCount` for bundles.
- Implemented as two queries unioned in the service layer and mapped to a single `CatalogItemDto` (one DTO, `kind`-tagged). Pagination over the merged set: simplest correct approach is to fetch+merge+sort+paginate in memory only if counts are small; otherwise paginate per-kind with a documented ordering. **Decide based on expected catalog size** (services per business is typically < few hundred → in-memory merge is fine; document the cap).
- The booking-setup endpoint (§7.0) is extended to surface bundles alongside categorized services so the client-facing form shows combos as bookable items.

### 4.4 Module placement

Put bundle code in the **services module** (`src/modules/services/`) so catalog management is one module, matching the "one place" requirement. `ServiceBundleService` lives there and is exported only if another module needs it (booking does — see §6). Do not create a separate top-level module unless the file count forces it; if so, keep it under services.

---

## 5. Pricing & duration computation (pure helper)

Create a pure computation helper (no DB) e.g. `BundlePricingService` or static methods, mirroring how `CalendarComputeService` is a private pure helper. **This computes list price only — no discounts.**
- `computeBundleListPrice(mode, members[])`:
  - `SUM` → Σ member `price`.
  - `FIXED` → `fixedPrice`.
- `computeBundleDuration(members[], executionMode)` → Σ `durationMinutes` for `SEQUENTIAL`; `max(durationMinutes)` for `PARALLEL` (the visit envelope length) — but per-item windows still carry each member's own duration.
- Money via `MoneyService`; never float arithmetic.

Seeding `BookingItem` snapshots at creation: `listPrice` per item = the member service's catalog price for a `SUM` bundle (or a standalone ad-hoc service). For a `FIXED` bundle, distribute the fixed total across member items so per-item `listPrice` sums **exactly** to the bundle total:
- Default rule: proportional to each member's catalog price.
- **Zero-price edge case** (member prices sum to 0, or some members are zero-priced — the YCLIENTS zero-price scenario): proportional distribution divides by zero. Fallback: distribute **equally** across all members when the price basis is 0; when only *some* members are zero-priced, give zero-priced members `0` and distribute the fixed total proportionally among the priced ones.
- **Rounding:** distribute with `MoneyService` to 2 decimals and assign the rounding remainder (last cents) to the first item so the sum is exact. Document this.
`chargedPrice` = `listPrice` in v1 (no pricing layer yet). These helpers are used both for catalog display and seeding.

---

## 6. Slot resolution engine (HIGHEST RISK — core of the feature)

The current engine (`CalendarService.getAvailableSlots` / `isSlotFree` / `filterAvailableStaff`, `CalendarComputeService.collectSlotsForDate`) assumes **one continuous interval for one staff**. Multi-service needs generalization. Keep `isSlotFree` conceptually pure; add higher-level orchestration.

### 6.1 Inputs & the three cases
A resolution request is a list of **required items**, each: `serviceId`, `durationMinutes` (+buffer), and a set of **candidate staff** (from `StaffService`), plus the `executionMode`. The engine handles exactly **three cases**, and tests (§12) are table-driven over them:
1. SEQUENTIAL, single staff (§6.2)
2. SEQUENTIAL, different staff per item (§6.3)
3. PARALLEL, one staff per item (§6.4)

Case 1 is detected when at least one candidate staff can perform *all* items and `executionMode = SEQUENTIAL`. Otherwise cases 2/3 apply per `executionMode`.

### 6.2 SEQUENTIAL, single staff (the common, cheap case)
Equivalent to today: total duration = Σ(duration+buffer). Reuse existing slot collection with the summed duration. Staff = anyone who can do **all** items.

### 6.3 SEQUENTIAL, different staff per item
Items are chained: item₀ at `[t, t+d₀)` by staff A, item₁ at `[t+d₀, t+d₀+d₁)` by staff B, etc. A start time `t` is valid iff there exists an assignment of candidate staff to items such that each staff is free on its sub-window and no staff is double-used in overlapping windows (they don't overlap in SEQUENTIAL, so the main constraint is per-item availability + a staff not assigned to two items unless free for both consecutively). Implementation: greedy/backtracking assignment per candidate start time. Keep the candidate-start grid at `business.slotIntervalMinutes`.

### 6.4 PARALLEL (4 hands)
All items share the same start `t`, each with its own window `[t, t+dᵢ)`. A start `t` is valid iff candidate staff can be assigned **one per item, all distinct, all free** on their windows simultaneously. This is a bipartite matching (items ↔ candidate staff) per start time — a simple matching suffices (Hopcroft–Karp is overkill; N≤10, greedy with backtracking is fine).

Edge cases the implementer MUST handle (fail fast with a clear `ErrorCode`, do not silently fall back):
- **Fewer distinct candidate staff than items** → PARALLEL is infeasible for this business/set → `BOOKING_NO_STAFF_AVAILABLE` (reuse existing) at resolve/create time; `resolve` returns no slots.
- **A staff is the only candidate for two different items** → that staff cannot do both at once in PARALLEL → the matching simply cannot cover both; if no valid matching exists for any `t`, return no slots.
- **Duplicate service in a PARALLEL set** (same service twice, e.g. two identical treatments at once) → allowed only if ≥2 distinct staff can perform it; handled naturally by the matching.
Document that PARALLEL correctness hinges on "distinct staff per item at the same instant" — this is the invariant the re-check inside the transaction (§6.6) must re-assert.

### 6.5 Calendar events per item — DECISION
Create **one `CalendarEvent` per `BookingItem`** (each occupies a specific staff's time). This is uniform and makes PARALLEL/different-staff natural. For SEQUENTIAL single-staff with 3 items you get 3 adjacent events for the same staff — acceptable and consistent; the calendar feed groups them by `bookingId` for display (§9). (Alternative — one merged event for single-staff — adds a special case; avoid.)

### 6.6 Concurrency / advisory locks (highest-care step #2)
Today: `pg_advisory_xact_lock(hash(staffId:date))`. Now a booking may touch **multiple staff**. In the create transaction:
- Compute the set of `(staffId, dateStr)` pairs across all items.
- Acquire advisory locks for **all** of them, in a **deterministic sorted order** (sort by the numeric lock key) to prevent deadlocks between concurrent multi-staff bookings.
- Re-check availability of every item's sub-window inside the transaction (tx-fetched shifts + block events), mirroring the existing re-check comment pattern.

### 6.7 Buffers
Decide buffer semantics and document in code: buffer applies after each item (per current `Service.bufferMinutes`). In SEQUENTIAL the next item starts after the previous item's buffer. In PARALLEL buffers extend each staff's occupied window independently.

---

## 7. Client-facing flow & API

### 7.0 `booking-setup` (existing) — extended
Keep as the initial catalog load for the form. Extend `BookingSetupResponseDto` to include **bundles** (as bookable catalog items with computed price/duration) alongside categorized services and staff. Current callers keep working; add fields, don't remove.

### 7.1 Generic resolve endpoint (NEW) — the heart of the dynamic form
`POST /public/businesses/:id/booking-resolve`

Request (`BookingResolveRequestDto`): current partial selection —
```
{ serviceIds?: string[]; bundleId?: string; staffId?: string }
```
(`bundleId` selects a pre-configured combo; `serviceIds` is the ad-hoc path; they are mutually exclusive — validate with a constraint like the existing `AtMostOneBookingChannelConstraint`.)

Response (`BookingResolveResponseDto`):
```
{
  availableServiceIds: string[];       // services still selectable given current state
  availableStaff: BookingResolveStaffDto[]; // staff selectable (empty when auto-assign)
  staffSelection: StaffSelectionMode;  // SINGLE | NONE
  executionMode: BookingExecutionMode; // implied by current selection
  totalDuration: number;               // envelope duration (Σ for SEQUENTIAL, max for PARALLEL)
  totalListPrice: string;              // MoneyService-formatted; v1 has no discounts so this is also what's charged
}
```
> Price vocabulary is consistent across the whole plan: `listPrice` / `chargedPrice` (§2.3) and their totals `totalListPrice` / `totalChargedPrice` (§10). `resolve` returns only `totalListPrice` because at the quote stage, in v1, no discount layer exists yet (§11.1) so charged == list; when the pricing layer lands, `resolve` gains `totalChargedPrice` too.
Symmetric behavior table:
| State | Response |
|---|---|
| staff set | `availableServiceIds` = services that staff performs (+ bundles fully coverable); keep `staffSelection = SINGLE` |
| services/bundle set, one staff covers all | `availableStaff` = those staff; `SINGLE` |
| services/bundle set, needs multiple staff | `availableStaff = []`; `NONE` (server auto-assigns) |
| empty | full catalog (mirror booking-setup) |

New enum file `StaffSelectionMode { SINGLE, NONE }`. Staff compatibility logic is a **named method on `StaffService`** (owns `staffService`): e.g. `resolveStaffingForServices(businessId, serviceIds): { coverableBySingle: Staff[]; requiresMultiple: boolean }` and `servicesPerformableBy(businessId, staffId): string[]`. `BookingsService`/controller call these — no direct `staffService` table access elsewhere.

### 7.1.1 `staffSelection` vs the channel `showStaff` flag — keep them separate

There is **one** booking flow; step order (services-first vs staff-first) is NOT configurable and needs no setting — the symmetric `resolve` endpoint handles either entry order. Do **not** introduce a "form type" / "step order" setting. The only relevant setting is the **existing `showStaff` flag**, which already lives on the booking *channel* (`BookingPage` / `BookingWidget` / `BookingFormConfigDto`) — that placement is correct (a business may run several channels with different policies) and must NOT move to the business level.

Two concerns that are easy to conflate — keep them distinct:
- **`showStaff` (channel policy, owner's choice):** whether the owner *wants* to offer staff selection at all. Some shops hide staff on purpose to load-balance ("any available master").
- **`resolve.staffSelection` (computed feasibility):** whether staff selection is even *possible* for the current selection (`NONE` when the services require different staff → server must auto-assign).

`resolve` returns `staffSelection` **independently of `showStaff`** — the backend does not mix the channel flag into `resolve`. The **frontend** combines them:

```
show the staff-selection step  ⟺  channel.showStaff == true  AND  resolve.staffSelection == SINGLE
```

Resulting behavior (covers every YCLIENTS case the product owner observed — barbershop single-staff in either order, and nail-salon "4 hands" with no staff step — from one flow):
- `showStaff = false` → staff step never shown; always auto-assign (current behavior preserved).
- `showStaff = true` + `SINGLE` → show staff selection (+ an "any" option).
- `showStaff = true` + `NONE` → staff step auto-hidden (physically impossible to pick one).

Deferred (not v1, does not affect the model): pre-selected service/staff deep-links are a UI/query-param concern, not a server setting.

### 7.2 Availability endpoint (existing, generalized)
`getAvailableSlots` / `getManualAvailableSlots` now accept the resolved item set (serviceIds (+ bundle) + optional preferred staffId) and run the §6 engine. Update `AvailableSlotsRequestDto` / `ManualAvailableSlotsRequestDto` to carry `serviceIds[]` / `bundleId` instead of a single `serviceId`.

---

## 8. Booking creation (highest-care step #3)

### 8.1 DTOs
- `CreateBookingDto` (public): replace `serviceId` with `serviceIds: string[]` **and/or** `bundleId`; keep optional `staffId` (only honored when a single staff covers all). `@ArrayNotEmpty`, `@ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)`, `@IsUUID(undefined,{each:true})`. Decide dup policy (allow same service twice? default: allow, with distinct items).
- `ManualCreateBookingDto` (admin): allow explicit **per-item staff assignment** and per-item `customPrice`: `items: { serviceId; staffId?; customPrice? }[]` + `executionMode?`. Admin may override auto-assignment.
- New interfaces for the resolved internal shape under `interfaces/` (e.g. `ResolvedBookingItem`).

### 8.2 `BookingCreateService.create()` rewrite

**Preserve all existing cross-cutting guards — do not drop them when rewriting.** The current `createPublicBooking` applies: `PublicBookingRateLimiter.assertAllowed(phone, ip)`, booking-channel attribution (`BookingChannelAttributionService.resolve`), private-visibility check, and the client-ban check (`isSelfBookingBlocked`). All of these still apply to a multi-item public booking exactly once per booking (not per item). Keep them at the top of the flow, unchanged.

1. Load business + all services (or bundle → explode to member services), validate business/visibility/active, resolve client (unchanged). Run rate-limit + ban guards (above).
2. Determine `executionMode` (from bundle, or inferred: if a single staff covers all and no parallel requested → SEQUENTIAL single-staff; else per rules).
3. Resolve staffing + a concrete start time via the §6 engine → produce `ResolvedBookingItem[]` each with `staffId`, sub-window `startAt/endAt`, and snapshots (title/duration/price via §5).
4. Transaction: acquire **multi-staff advisory locks** (§6.6, sorted); re-check every item; create one `CalendarEvent` per item; create `Booking` (envelope = min start / max end, `executionMode`, `bundleId?`); create `BookingItem[]` linked to their events.
5. Audit payload lists all items (service, staff, price) + total; notification summarizes the visit (multiple services, total price, envelope time). `BookingConfirmedNotification` must take a list, not a single service.

### 8.3 Status transitions, completion, cancellation, delete
- `updateStatus` → completion now records **per-item** earnings (§9). Reversal reverses all item earnings.
- `completeElapsed` cron: envelope `endAt` drives completion (unchanged logic, per-item earnings on complete).
- Reminder cron (`reminderSentAt` lives on `Booking`, visit-level): unchanged — one reminder per visit keyed on the envelope `startAt`. The reminder message summarizes the whole visit (all services / staff / envelope time), mirroring the notification change in §8.2 step 5.
- `cancel` / `delete`: delete/cancel **all** item calendar events; reverse all item earnings if was completed. `Booking.deletedAt` soft-delete cascades to items via query filtering.

### 8.4 Update / reschedule
`updateWithSlotReschedule` generalizes: rescheduling moves the whole visit (re-run engine for the new start/staff, update all item windows + calendar events under multi-staff lock). **Changing the item set** (add/remove a service on an existing booking) is a bigger feature — mark as a **follow-up**; v1 reschedule keeps the same items.

---

## 9. Payroll (highest-care step #4)

`StaffEarningsService.recordForCompletedBooking` / `reverseForBooking` are rewritten to operate **per `BookingItem`**:
- For each item: resolve the performing staff's compensation plan, `resolveServicePercent(plan, item.serviceId)`, base = `item.customPrice ?? item.chargedPrice` (the effective charged amount — this already respects any future discount written to `chargedPrice`); create one `StaffEarning` linked via `bookingItemId` (and `staffId` from the item — items in one booking can pay **different** staff).
- Idempotency: `idempotencyKey` must key on `bookingItemId` (not just bookingId) so multi-item bookings don't collide and partial re-runs are safe.
- Reversal: reverse each item's earning individually; a booking-level reversal iterates items.
- Update specs: `staff-earnings.service.spec.ts` must cover multi-item, multi-staff, per-item percent.

---

## 10. Read side: responses, calendar, search, export

- **`BookingResponseDto`**: add `items: BookingItemResponseDto[]` (new DTO: serviceId, serviceTitle, duration, `listPrice`, `chargedPrice`, customPrice, staffId, staffName, startAt, endAt), `executionMode`, `totalListPrice`, `totalChargedPrice`, `totalDuration`, `bundleId?`. Remove the single-service fields (they're now in items). `fromEntity` maps from a `Booking` with `items` included — update `BookingsService.findById`/`search` to `include: { items: ... }`.
- **Calendar feed** (`listForCalendar` / `CalendarEventItemDto`): a booking now yields **one calendar entry per item** (each on its staff's row). Group/label by `bookingId` so the UI can render "visit" grouping; a PARALLEL booking shows simultaneous entries on different staff rows; a SEQUENTIAL multi-staff booking shows adjacent entries across rows. `CalendarBookingFeed`/`CalendarBookingReader` interfaces change from per-booking to per-item rows. `linkedEventIds` now come from items.
- **Search** (`bookings.service.ts`): `serviceId`/`serviceTitle`/`staffId` filters move to the `items` relation (`items: { some: { serviceId: { in } } }`, text search on `items.serviceTitle` / `items.staffName`). The hand-written SQL branch for price sort (`searchByChargedPrice`, `bookingWherePart`, etc.) must be reworked: "charged price" becomes a per-booking aggregate over items (`Σ COALESCE(customPrice, chargedPrice)`); rewrite the raw SQL to join `BookingItem` and group. This is the fiddliest read-side change — budget time and keep the existing SQL-injection-safe whitelisting approach.
- **Export (XLSX)**: a booking spans multiple services/staff. Decide row model: one row per booking with services concatenated, OR one row per item. Recommend **one row per item** (cleaner for payroll/accounting), with booking-level columns repeated. Update `bookings-export.service.ts` + its spec.

---

## 11. Explicitly deferred (do NOT build in v1, but don't block)

- Per-staff service duration/price overrides (YCLIENTS feature). Model allows it later via a staff-service override table; `BookingItem` snapshots already capture the effective values.
- Editing the item set of an existing booking (add/remove service post-creation).
- Bundle-level tech cards / inventory.

### 11.1 Pricing / discounts layer (future, deliberately OUT of the catalog)

**Design intent (product owner):** discounts are NOT a property of a service or a bundle. They are a separate layer — **coupons, pricing policies over sets of services, seasonal pricing, happy-hours, per-order/per-client discounts** — applied *to an order* at booking time, on top of catalog list prices. The catalog only ever stores list prices (§2, §5). Do not bake any discount mechanic into `Service` or `ServiceBundle`.

What v1 must do so this layer lands later **without a schema rewrite** (already reflected above — this is the whole reason for the price split):
- `BookingItem` carries `listPrice` (catalog) **and** `chargedPrice` (what's actually paid). In v1 they are equal; the future layer writes `chargedPrice < listPrice` and records provenance.
- Commission/payroll (§9) already bases on the *effective charged* amount (`customPrice ?? chargedPrice`), so discounts flow into payroll correctly for free.
- Reporting/search aggregates over `chargedPrice`, so "revenue after discounts" is already the number shown.

What the future module will add (sketch, NOT for v1): a `PricingPolicy` / `Coupon` / `Promotion` domain; an application step during booking creation/quote that takes resolved `BookingItem[]` + client + channel + time and returns per-item adjustments; a `BookingItemAdjustment` (or booking-level) table recording each applied discount (type, source policy/coupon, amount) for auditability and "you saved X" display. This slots in ahead of the final price write in §8.2 step 3 and does not change any table created in v1 beyond adding the adjustment table.

---

## 12. Suggested implementation order (critical path)

1. **Schema + migration** (§2, §3) — two-phase (add+backfill first; drop old columns later).
2. **Catalog: bundle CRUD + unified list + pricing helper** (§4, §5).
3. **Slot engine generalization** (§6) — the hard core; write exhaustive unit tests first (table-driven over the three cases).
4. **Resolve endpoint + StaffService staffing methods** (§7).
5. **Booking creation rewrite + multi-staff locking** (§8).
6. **Payroll per-item** (§9).
7. **Read side: responses, calendar feed, search, export** (§10).
8. **End-to-end tests** across modes + migration verification.

Parallelizable after (1): catalog CRUD (2) is independent of the slot engine (3). Payroll (6) depends on booking creation (5). Read side (7) depends on schema (1) but can start early on DTOs.

Highest-risk, do-with-most-care: **§3 migration**, **§6 slot engine**, **§6.6 multi-staff locking**, **§9 payroll idempotency**.

---

## 13. New/changed files checklist (non-exhaustive, by convention)

**Prisma:** `schema.prisma` (+enums, +3 models, modified `Booking`, `StaffEarning`, `CalendarEvent`); one migration dir.

**enums/** (one file each): `BookingExecutionMode` and `BundlePricingMode` are **both Prisma enums and TS enums** (mirror in `schema.prisma`). `CatalogItemKind` and `StaffSelectionMode` are **TS-only** (API/read-model concerns, no DB column) — do NOT add them to Prisma.

**services module:** `ServiceBundleService`, DTOs (`CreateServiceBundleDto`, `UpdateServiceBundleDto`, `ServiceBundleResponseDto`, `ServiceBundleItemDto`, search DTOs, status DTO), `CatalogItemDto`, controller routes, `BundlePricingService` (pure), audit fields.

**staff module:** new named methods `resolveStaffingForServices`, `servicesPerformableBy` on `StaffService`.

**calendar module:** generalized slot methods on `CalendarService`; new logic in `CalendarComputeService` for sequential-chain & parallel-matching; updated `CalendarBookingReader`/feed interfaces + `CalendarEventItemDto`.

**bookings module:** `BookingResolveRequestDto`/`ResponseDto`/`BookingResolveStaffDto`, rewritten `CreateBookingDto`/`ManualCreateBookingDto`, `BookingItemResponseDto`, updated `BookingResponseDto`, rewritten `BookingCreateService`, updated `BookingsService` (search/read/update/cancel/delete), new resolve route in controller, updated export service.

**payroll module:** rewritten `StaffEarningsService.recordForCompletedBooking`/`reverseForBooking`; updated idempotency keying.

**shared:** `ErrorCode` entries (bundle + multi-service); `MULTI_SERVICE_MAX_ITEMS` constant; any new `PrismaErrorCode` if needed.

**tests:** specs for slot engine (table-driven), bundle CRUD, booking create (all modes), payroll per-item, export, migration verification.
