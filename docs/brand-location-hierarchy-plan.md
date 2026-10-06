# Brand → Location Hierarchy — Implementation Plan

> **Status:** Approved design, not yet implemented.
> **Audience:** The engineer/agent implementing this. Read the whole document before writing code.
> **Date:** 2026-10-06
> **Prerequisite knowledge:** `CLAUDE.md` project rules (one-class-per-file, exceptions via `ErrorCode`+`AppException`, DatabaseService injected directly, services return Prisma models, DTO mapping in controllers, pagination DTOs, module export rules).

---

## 1. Goal & Context

The product is a booking/automation SaaS for the services industry. Today a single root entity `Business`
conflates **two roles**: the brand (name, logo) *and* the physical point of sale (timezone, currency, slot
settings, booking visibility). Every operational entity (staff, services, bookings, calendar, payroll,
inventory, clients) is scoped directly by `businessId`, and authorization is a single-level membership
(`Membership`) checked by `RbacGuard` against the `:businessId` URL param.

We are introducing a **two-level hierarchy** so one brand can own multiple physical locations (YClients-style):

```
Brand                         ← the renamed Business; the tenant root
 ├─ name, logoFileId, billing
 ├─ BrandMembership[]          ← owner / network admin; sees ALL locations
 ├─ Client[]                   ← clients are SHARED across the whole brand
 └─ Location[]                 ← physical points of sale (operational unit)
      ├─ countryCode, currency, timezone     (immutable anchors)
      ├─ businessType, city, addressLine      (editable profile)
      ├─ slotIntervalMinutes, advanceBookingWindowDays,
      │  minimumBookingNoticeMinutes,
      │  bookingVisibility, isBookingConfirmationRequired   (operational settings)
      ├─ LocationMembership[]  ← staff locked to a single location
      └─ Service, ServiceCategory, ServiceBundle, Staff, Booking, BookingItem,
         CalendarEvent, BookingPage, BookingWidget, Payroll*, StaffEarning, AuditLog
```

### Decisions already made (do NOT re-litigate)

1. **Rename `Business` → `Brand` everywhere** (model, Prisma types, services, DTOs, variables). Clean semantics
   over minimal churn. No production data exists yet, so migration risk is low.
2. **Clients are shared across the brand** → `Client.brandId`; unique key `@@unique([brandId, phone])`.
3. **Catalog (services) is per-location**, NOT shared.
4. **One staff member = one location** → simple `Staff.locationId` (no many-to-many).
5. **Currency / country / timezone live on `Location`, not `Brand`.** Legal anchor = place of business; a brand
   is international. `StaffEarning.currency` / `PayrollPeriod.currency` are already denormalized per-row, so
   multi-currency across a network already works; network-wide reports GROUP BY currency, never blind-sum.
6. **Two-level membership:** `BrandMembership` (owner/admin, sees all locations) + `LocationMembership` (staff
   locked to their location). A location is accessible if the user is a brand member with a sufficient role
   **OR** a location member of *that* location.
7. **URLs do NOT carry `brandId` for operational resources** — a UUID `locationId` is globally unique and the
   brand is derivable. Routes:
   - `/brands/:brandId/...` → brand resources (clients, location list, brand settings).
   - `/locations/:locationId/...` → operational resources (services, staff, bookings, calendar, payroll, channels).
8. **Auth payload freshness via per-user token epoch + invalidation registry** (see §4). JWT carries the
   `location → brand` mapping and both membership lists; no per-request DB lookup on the hot path.

---

## 2. Current-state facts (verified in code, 2026-10-06)

- Prisma schema: `src/database/schema.prisma`. Migrations: `src/database/migrations/` (custom path — NOT
  `prisma/`). Prisma config: `prisma.config.ts`. Scripts: `db:migrate` = `prisma migrate dev`,
  `db:push`, `db:generate`.
- `Business` model: `src/database/schema.prisma:267`. Fields currently on it that must MOVE to `Location`:
  `advanceBookingWindowDays`, `slotIntervalMinutes`, `minimumBookingNoticeMinutes`, `timezone`, `currency`,
  `bookingVisibility`, `isBookingConfirmationRequired`. Stays on `Brand`: `name`, `logoFileId`, timestamps,
  `logoFile` relation.
- Models FK'd to `businessId` today (relation list on `Business`): `Membership`, `Client`, `ServiceCategory`,
  `Service`, `Staff`, `StaffInvitation`, `CalendarEvent`, `Booking`, `BookingItem`, `BookingPage`,
  `BookingWidget`, `ServiceBundle`, `StaffCompensationPlan`, `StaffEarning`, `PayrollPeriod`, `PayrollResult`.
  `AuditLog` also stores `businessId` (no relation, just a column + indexes).
- Authorization has **two** paths, both keyed on `businessId`:
  - `RbacGuard` (`src/modules/business/guards/rbac.guard.ts`) reads `request.params['businessId']` and matches
    `payload.memberships`. ADMIN bypasses.
  - `assertBusinessRole(payload, businessId, ...roles)` in `src/modules/auth/dto/token-payload.dto.ts`, called
    in **~45 sites** across: `dashboard.controller`, `clients.controller`, `staff.controller`,
    `staff-kpi.controller`, `payroll.controller`, `staff-compensation.controller`, `staff-earnings.controller`,
    `bookings.controller`, `bookings.service`. Each passes a `businessId` taken from a DTO field or a fetched
    entity (`entity.businessId`).
- Token issuance: `src/modules/auth/auth.service.ts` — `generateAccessToken` (lines ~196-203) is the single
  place membership is loaded (`db.membership.findMany`) and embedded. `issueTokens` orchestrates;
  `generateRefreshToken` holds only `{ sub }`.
- `token-payload.dto.ts` currently **violates one-class-per-file**: it holds `MembershipPayloadDto`,
  `TokenPayloadDto`, and the `assertBusinessRole` function in one file. Split during this work.
- Staff onboarding creates a membership at `staff.service.ts:520` (`tx.membership.create`). This becomes a
  `LocationMembership`.
- `BusinessService.getLocale` / `getLocalesByIds` return `{ timezone, currency }` by `businessId`. These are
  consumed by time/locale logic and must become location-keyed (currency/timezone now live on `Location`).
- `BusinessModule` (`src/modules/business/business.module.ts`) exports `BusinessService` + `RbacGuard`.
- **Cache:** project has `@nestjs/cache-manager` + `cache-manager` v7 (in-memory by default). **No Redis.**
- `DashboardService`, `ClientsController`, and several others currently take `businessId` from the **DTO body**
  (e.g. `dto.businessId`), not the URL param. Those endpoints will move to URL-scoped `brandId`/`locationId`.

---

## 3. Target data model (Prisma)

> Field types below are directional; match existing column types/attributes where a field merely moves.

### `Brand` (renamed from `Business`)
- Keep: `id`, `name` `@db.VarChar(255)`, `logoFileId` + `logoFile` relation, `createdAt`, `updatedAt`.
- **Remove** (moved to `Location`): `advanceBookingWindowDays`, `slotIntervalMinutes`,
  `minimumBookingNoticeMinutes`, `timezone`, `currency`, `bookingVisibility`, `isBookingConfirmationRequired`.
- Relations: `brandMemberships BrandMembership[]`, `clients Client[]`, `locations Location[]`.
- Remove all operational relation arrays (they move to `Location`).

### `Location` (new)
- `id String @id @default(uuid())`
- `brandId String` + `brand Brand @relation(..., onDelete: Cascade)`
- `name String @db.VarChar(255)` — location display name (e.g. "Barbershop on Lenina St").
- Anchors (immutable after create — enforced in service, see §5.3): `countryCode String @db.VarChar(2)`,
  `currency String @db.VarChar(3)`, `timezone String @db.VarChar(64)`.
- Profile (editable): `businessType BusinessType?`, `city String? @db.VarChar(...)`,
  `addressLine String? @db.VarChar(...)`.
- Operational settings (editable, carry the current defaults): `advanceBookingWindowDays Int @default(60)`,
  `slotIntervalMinutes Int @default(30)`, `minimumBookingNoticeMinutes Int @default(0)`,
  `bookingVisibility BookingVisibility @default(PUBLIC)`, `isBookingConfirmationRequired Boolean @default(false)`.
- `createdAt`, `updatedAt`.
- Relations: `locationMemberships`, and all operational arrays (`services`, `serviceCategories`,
  `serviceBundles`, `staff`, `staffInvitations`, `calendarEvents`, `bookings`, `bookingItems`, `bookingPages`,
  `bookingWidgets`, `compensationPlans`, `staffEarnings`, `payrollPeriods`, `payrollResults`).
- Index: `@@index([brandId])`.

### `BrandMembership` (renamed from `Membership`)
- `id`, `userId`, `brandId`, `role BusinessRole`, timestamps.
- `@@unique([userId, brandId])`, `@@index([brandId])`.
- Relations to `User` (Cascade) and `Brand` (Cascade).

### `LocationMembership` (new)
- `id`, `userId`, `locationId`, `role BusinessRole`, timestamps.
- `@@unique([userId, locationId])`, `@@index([locationId])`.
- Relations to `User` (Cascade) and `Location` (Cascade).

### FK moves: `businessId` → `locationId`
For each model below, rename the column and relation from brand/business to `location`
(`onDelete` behavior preserved from current schema):
`ServiceCategory, Service, ServiceBundle, Staff, StaffInvitation, CalendarEvent, Booking, BookingItem,
BookingPage, BookingWidget, StaffCompensationPlan, StaffEarning, PayrollPeriod, PayrollResult`.
Update every `@@index`/`@@unique` that references `businessId` (e.g. `Booking @@index([businessId, deletedAt, startAt])`
→ `locationId`; `BookingWidget @@unique([businessId, titleKey])` → `locationId`; `StaffEarning @@unique([businessId, idempotencyKey])`
→ `locationId`; `PayrollPeriod @@unique([businessId, startDate, endDate])` → `locationId`; etc.).

### `Client` → brand-scoped
- `businessId` → `brandId` + relation to `Brand`.
- `@@unique([businessId, phone])` → `@@unique([brandId, phone])`.
- `@@index([businessId])` → `@@index([brandId])`.

### `AuditLog`
- `businessId` column: decide per-entity scope. Operational entities (BOOKING, STAFF, SERVICE, PAYROLL) →
  store `locationId`. CLIENT and BRAND-level events → store `brandId`. Simplest consistent approach: keep a
  single `brandId` column on `AuditLog` **plus** an optional `locationId` column, and have audit emitters pass
  whichever is relevant. Update the `@@index([businessId, ...])` indexes accordingly. Add `LOCATION` to the
  `AuditEntity` enum and location CRUD events to `AuditEvent` (see §5.6).

### New enum `BusinessType`
```
BARBERSHOP, HAIR_SALON, NAIL_SALON, BEAUTY_SALON, SPA, MASSAGE, COSMETOLOGY,
TATTOO_PIERCING, BROWS_LASHES, MEDICAL_CLINIC, FITNESS, YOGA_STUDIO, AUTO_SERVICE,
PET_GROOMING, EDUCATION, PHOTO_STUDIO, OTHER
```
One enum per file is a TS rule, not a Prisma rule — the enum lives in `schema.prisma`; any TS mirror enum
follows one-per-file under the appropriate `enums/` folder.

### Country → currency/timezone reference
- Keep `countryCode` as a bare 2-letter code in the DB.
- A lookup table (country → default currency + candidate timezones) lives in **code** under `src/shared/`
  (e.g. `src/shared/geo/country-defaults.ts`), NOT in the DB. Used to pre-fill/validate location creation
  (`BY → BYN, Europe/Minsk`; `RU → RUB, timezone chosen separately`; etc.).

---

## 4. Authorization & token freshness

### 4.1 JWT payload (new shape)
Extend the access-token payload to carry both membership levels and the location→brand mapping:
```
sub, role, firstName?, lastName?,
brandMemberships:    [{ brandId, role }]
locationMemberships: [{ locationId, brandId, role }]   // brandId included → location→brand map for free
tokenEpoch: number                                     // see 4.3
```
`brandId` embedded in each `locationMembership` gives the guard the location→brand mapping without a DB hit.
A brand owner typically has no location memberships; their access to any location in the brand comes from
`brandMemberships`.

### 4.2 Guard logic
Two decorators/guards, mirroring the two URL shapes:
- **Brand-scoped routes** (`:brandId` param): access if ADMIN, or `brandMemberships` has a matching `brandId`
  with a sufficient role. (This is essentially today's `RbacGuard`, re-keyed to `brandId`.)
- **Location-scoped routes** (`:locationId` param): access if ADMIN, or `locationMemberships` has that
  `locationId` with a sufficient role, **or** the location's `brandId` (looked up from the
  `locationMemberships` entry if present) is in `brandMemberships` with a sufficient role. If the `locationId`
  is absent from the token entirely (e.g. a location created after this token was issued), the guard treats the
  token as stale → see 4.3 (returns the re-auth signal, not a hard 403).
- Replace `assertBusinessRole` with location/brand-aware equivalents (keep them as small pure functions, each
  in its own file under an appropriate `guards/` or `shared/` location, respecting one-per-file). Every one of
  the ~45 call sites gets migrated in Phase 4 alongside its domain.

### 4.3 Per-user token epoch (payload auto-refresh)
Goal: when something changes a user's effective payload (membership granted/revoked, role changed, location
created/deleted within a brand they belong to), old access tokens must be invalidated so the frontend
re-fetches a fresh payload.

Mechanism (chosen for correctness + simplicity; uses existing `cache-manager`, no token list):
- Registry key: `userId → tokenEpoch` (a monotonically increasing number or timestamp), stored via
  `cache-manager`.
- On access-token issue, embed the user's current `tokenEpoch` in the payload.
- A guard/interceptor compares `payload.tokenEpoch` with the registry value for `sub`. If
  `payload.tokenEpoch < registry[sub]` (or the location is missing from a token known to be stale), respond
  with a dedicated re-auth status so the frontend knows to refresh (distinct, documented code/marker — do NOT
  reuse a generic 401 that could also mean "access token expired by TTL"; pick one and document it in the FE
  contract). The frontend refreshes, gets a fresh payload, and retries the original request.
- Mutations that must bump the epoch (`registry[sub] = now()` for every affected user): create/delete location,
  grant/revoke brand or location membership, change a membership role.
- **Frontend contract:** on the re-auth signal, refresh once and retry. Add a guard against infinite
  `signal → refresh → signal` loops (cap consecutive retries, e.g. 1-2).
- **Scale-out caveat:** `cache-manager` is in-memory here, correct only for a single instance. Horizontal
  scaling REQUIRES a shared store (Redis). Document this explicitly where the registry is implemented; do not
  silently rely on in-process memory if more than one instance is ever run.

---

## 5. Phased implementation

Each phase must end with a green build (`npm run build`) and green tests (`npm run test`). Do not start a phase
before the previous one builds. Because there is no production data, the DB can be reset freely.

### Phase 1 — Schema & migration (foundation)
1. Edit `src/database/schema.prisma` to the target model in §3: rename `Business`→`Brand`; strip operational
   fields off `Brand`; add `Location`; rename `Membership`→`BrandMembership`; add `LocationMembership`; move all
   operational FKs `businessId`→`locationId`; move `Client` to `brandId`; add `BusinessType` enum; add
   `AuditLog` location/brand columns; add `LOCATION` audit entity + location audit events.
2. Add the country-defaults reference module under `src/shared/geo/`.
3. Generate the migration. Since no data exists and the migration path is custom
   (`src/database/migrations/`), the cleanest route is `prisma migrate reset` + a fresh migration (or replace
   the baseline). Confirm `prisma.config.ts`/`schema.prisma` migration directory settings first. Run
   `npm run db:generate` to refresh the Prisma client types.
4. **Exit criteria:** `prisma generate` succeeds; schema compiles. (App won't build yet — that's expected;
   type errors from renamed models are the Phase 2-4 worklist.)

### Phase 2 — Auth core (token payload, guards, epoch registry)
1. Split `src/modules/auth/dto/token-payload.dto.ts` per one-class-per-file:
   `brand-membership-payload.dto.ts`, `location-membership-payload.dto.ts`, `token-payload.dto.ts`. Move
   `assertBusinessRole` out into its own replacement(s) under `guards/`/`shared/` (brand + location variants).
2. Update `auth.service.ts` `generateAccessToken`: load `brandMemberships` (from `brandMembership`) and
   `locationMemberships` (from `locationMembership`, selecting `locationId`, `role`, and the parent `brandId`),
   embed both + `tokenEpoch`.
3. Implement the token-epoch registry service over `cache-manager` (get/bump by `userId`). Document the
   Redis-for-scale-out caveat in the file.
4. Rework `RbacGuard` into brand-scoped + location-scoped guards/decorators per §4.2, including the stale-token
   re-auth signal per §4.3.
5. Wire the epoch check into the request pipeline (guard or interceptor).
6. **Exit criteria:** auth module builds in isolation; unit tests for the guards (brand-only member, location
   member, cross-location denial, stale-epoch signal) pass.

### Phase 3 — Split BusinessModule → Brand + Location modules
1. Create `BrandModule` (brand CRUD: name/logo/members/billing; owns `Brand` + `BrandMembership`). Controller
   routes under `/brands`. Create DTOs: `CreateBrandDto`, `UpdateBrandDto`, responses.
2. Create `LocationModule` (location CRUD + settings; owns `Location` + `LocationMembership`). Controller routes
   under `/brands/:brandId/locations` for create/list and `/locations/:locationId` for get/update/delete.
   DTOs: `CreateLocationDto` (requires `name`, `countryCode`, `currency`, `timezone`; optional
   `businessType`, `city`, `addressLine`, settings), `UpdateLocationDto` (everything editable EXCEPT
   `countryCode`/`currency`/`timezone` — those are omitted from the update DTO and rejected server-side).
3. `getLocale`/`getLocalesByIds` move to `LocationService`, keyed by `locationId`.
4. On location create, bump token epoch for brand members (so owners immediately gain access).
5. Update module imports/exports per CLAUDE.md (export a provider only when another module imports it).
6. Preserve the "create brand → auto-create owner membership + owner Staff" onboarding, re-expressed across
   Brand (owner `BrandMembership`) and Location (the first location + its owner `Staff`/`LocationMembership`).
   Decide and document whether brand creation also creates a first default location (recommended: yes, so the
   onboarding flow stays single-step for single-location businesses).
7. **Exit criteria:** brand + location modules build; create/list/update/delete work; immutable anchors are
   rejected on update with a proper `ErrorCode`/`AppException`.

### Phase 4 — Switch domains to location scope (the bulk)
Do these **one domain at a time**, each as an isolated green build + test cycle. For each: update the owning
service's queries (`businessId`→`locationId`), the controller (take `locationId` from the URL, not `dto.businessId`),
DTOs, the `assertBusinessRole`→location-guard migration at every call site, and the domain's `*.spec.ts`.

Order (dependency-friendly):
1. **services** (`service-catalog`, `services`, `service-bundle`, categories, analytics) — foundational catalog.
2. **staff** (`staff.service` incl. the membership-create at line ~520 → `LocationMembership`; `staff-export`,
   `staff-kpi`).
3. **calendar** (`calendar.service`, `calendar-booking-reader`) — owns `calendarEvent`.
4. **bookings** (`booking-create`, `bookings`, aggregates, analytics, export, cron) — heaviest; depends on
   services/staff/calendar. Re-point the client-ownership check (see Phase 5).
5. **booking-channels** (pages, widgets, publish, attribution, public controllers) — per-location channels.
6. **payroll** (periods, compensation, earnings, report) — owns payroll tables + `staffEarning`.
7. **clients** (`clients.service`, import/export, analytics) — move to **brandId** scope (NOT location), update
   the `@@unique([brandId, phone])`-dependent logic and the controllers that read `dto.businessId`.
8. **dashboard** — aggregates; decide brand-wide vs per-location widgets (likely per-location by default, with
   brand-level rollups later).
Respect domain ownership (CLAUDE.md §Architecture): a service needing another domain's data calls the owning
service, never queries its tables. Cross-domain re-checks inside an open `$transaction` may pass fetched
entities to a pure method — mark such sites with a comment.

### Phase 5 — Cross-domain seams & cleanup
1. **BookingCreateService client check:** the old "client belongs to the same business" invariant becomes
   "client belongs to the same **brand** as the booking's location." Resolve the brand from the location.
2. **Audit:** route `businessId` → `brandId`/`locationId` per §3; add location CRUD audit events/templates
   (`src/modules/audit/...`, including the `ru` hbs template + fields file, mirroring the existing business ones).
3. **Locale/time:** ensure every consumer of timezone/currency reads from the location, not the brand.
4. Grep for residual `businessId` in `.ts` (excluding intentional brand-level spots) and residual
   `db.business`/`db.membership` references; convert or remove.
5. Full `npm run build` + `npm run test` + `npm run lint`. Spot-check Swagger for the new route shapes.

---

## 6. Risks & watch-items

- **~45 `assertBusinessRole` call sites** are the real effort, not the schema. Migrate them with their domain in
  Phase 4; don't try to do all auth in Phase 2.
- **Endpoints reading `dto.businessId` from the body** (dashboard, clients, some payroll/bookings) change shape
  to URL-scoped params — this is an API breaking change; coordinate with frontend.
- **`cache-manager` is in-memory** → the epoch registry is single-instance-correct only. Flag Redis for
  scale-out. Do not ship multi-instance without it.
- **Re-auth signal must be distinct** from TTL-expiry 401 or the frontend can't tell "refresh payload" from
  "silent token refresh". Document the exact code/marker in the FE contract.
- **Refresh-loop guard** on the frontend is mandatory (cap consecutive re-auth retries).
- **Onboarding flow:** confirm the brand-create → default-location behavior so single-location signups stay
  one step. Document the final choice.
- **AuditLog scope** (brand vs location column) — pick the dual-column approach in §3 and apply consistently so
  existing audit queries/indexes keep working.

## 7. Route signatures (before → after)

> Illustrative, not exhaustive. Conventions carried over from the current code: all responses wrapped in
> `BaseResponseDto.success(...)`; DELETE → `204` + `Promise<void>`; list/search → pagination DTOs; `@Auth()` for
> plain-authenticated, the new brand/location guards replace `assertBusinessRole`. **Key change:** today most
> endpoints read `businessId` from the DTO **body/query**; they move to a URL path param (`:brandId` or
> `:locationId`), which is a breaking change for the frontend.

### Legend
- `@BrandRbac(...roles)` — new guard; requires a brand membership (or ADMIN) matching `:brandId`.
- `@LocationRbac(...roles)` — new guard; grants if location member of `:locationId` OR brand member of its
  parent brand (or ADMIN). Emits the stale-token re-auth signal when `:locationId` is absent from the token.

### Brand resources — base path `/brands`
```
POST   /brands                                 create brand (+ owner BrandMembership, first Location, owner Staff)
GET    /brands                                 list caller's brands (ADMIN: all)        @Auth
GET    /brands/:brandId                        brand details                            @BrandRbac(OWNER, STAFF)
PUT    /brands/:brandId                        update brand (name, logoFileId)          @BrandRbac(OWNER)
DELETE /brands/:brandId                        delete brand                             @BrandRbac(OWNER) → 204
GET    /brands/:brandId/public                 public brand info (no auth)
```

### Locations — nested for create/list, flat for item ops
```
POST   /brands/:brandId/locations              create location                          @BrandRbac(OWNER)
GET    /brands/:brandId/locations              list locations in brand                  @BrandRbac(OWNER, STAFF)
GET    /locations/:locationId                  location details                         @LocationRbac(OWNER, STAFF)
PUT    /locations/:locationId                  update location (profile + settings;     @LocationRbac(OWNER)
                                               countryCode/currency/timezone rejected)
DELETE /locations/:locationId                  delete location                          @LocationRbac(OWNER) → 204
GET    /locations/:locationId/public           public location info (no auth)
```
- `CreateLocationDto`: `name`, `countryCode`, `currency`, `timezone` (required); `businessType?`, `city?`,
  `addressLine?`, settings (optional, defaults as in §3).
- `UpdateLocationDto`: `name?`, `logoFileId?`(if applicable), `businessType?`, `city?`, `addressLine?`,
  `bookingVisibility?`, `isBookingConfirmationRequired?`, `advanceBookingWindowDays?`, `slotIntervalMinutes?`,
  `minimumBookingNoticeMinutes?`. **Omits** the three anchors; a server-side check rejects any attempt to change
  them via a dedicated `ErrorCode` + `AppException`.

### Clients — brand-scoped (shared across the brand). Base path `/brands/:brandId/clients`
```
# before: @Controller('clients'), businessId in body/query, assertBusinessRole
POST   /brands/:brandId/clients                create client                            @BrandRbac(OWNER)
GET    /brands/:brandId/clients                search clients (paginated)               @BrandRbac(OWNER, STAFF)
GET    /brands/:brandId/clients/export         xlsx stream                              @BrandRbac(OWNER, STAFF)
POST   /brands/:brandId/clients/import         xlsx import                              @BrandRbac(OWNER)
GET    /brands/:brandId/clients/:id            client by id                             @BrandRbac(OWNER, STAFF)
PUT    /brands/:brandId/clients/:id            update client                            @BrandRbac(OWNER)
PATCH  /brands/:brandId/clients/:id/ban        ban/unban                                @BrandRbac(OWNER) → 204
```
- `CreateClientDto`/`ClientSearchRequestDto`/`ClientExportRequestDto`/`ClientImportRequestDto` drop their
  `businessId` field (now the `:brandId` path param). Uniqueness is `@@unique([brandId, phone])`.

### Staff — location-scoped. Base path `/locations/:locationId/staff`
```
# before: @Controller('staff'), businessId in body/query, assertBusinessRole
POST   /locations/:locationId/staff                     create staff (+ LocationMembership on onboarding)  @LocationRbac(OWNER)
GET    /locations/:locationId/staff                     search staff (paginated)       @LocationRbac(OWNER, STAFF)
GET    /locations/:locationId/staff/status-counts       count per status               @LocationRbac(OWNER, STAFF)
GET    /locations/:locationId/staff/export              xlsx stream                    @LocationRbac(OWNER, STAFF)
GET    /locations/:locationId/staff/:id                 staff by id                    @LocationRbac(OWNER, STAFF)
PUT    /locations/:locationId/staff/:id                 update staff                   @LocationRbac(OWNER)
PATCH  /locations/:locationId/staff/:id/status          change status                  @LocationRbac(OWNER) → 204
DELETE /locations/:locationId/staff/:id                 delete staff                   @LocationRbac(OWNER) → 204
GET    /locations/:locationId/staff/:id/shifts          shifts in range                @LocationRbac(OWNER, STAFF)
PUT    /locations/:locationId/staff/:id/shifts          replace shifts in range        @LocationRbac(OWNER)
POST   /locations/:locationId/staff/:id/invitations     create invitation              @LocationRbac(OWNER)
POST   /staff/invitations/accept                        accept invitation (invitee)    @Auth
```
- Invitation acceptance stays unscoped (`@Auth`) — the token identifies the staff/location; it creates the
  invitee's `LocationMembership`. The "already a member" conflict is now per-location.

### Services / catalog — location-scoped. Base path `/locations/:locationId/...`
```
POST|GET|PUT|DELETE  /locations/:locationId/service-categories[/:id]   @LocationRbac(...)
POST|GET|PUT|DELETE  /locations/:locationId/services[/:id]             @LocationRbac(...)
POST|GET|PUT|DELETE  /locations/:locationId/service-bundles[/:id]      @LocationRbac(...)
GET                  /locations/:locationId/services/catalog           public/internal catalog listing
```

### Bookings — location-scoped. Base path `/locations/:locationId/bookings`
```
POST   /locations/:locationId/bookings                 create (manual)                @LocationRbac(OWNER, STAFF)
GET    /locations/:locationId/bookings                 search (paginated)             @LocationRbac(OWNER, STAFF)
GET    /locations/:locationId/bookings/:id             by id                          @LocationRbac(OWNER, STAFF)
PUT    /locations/:locationId/bookings/:id             update                         @LocationRbac(OWNER, STAFF)
PATCH  /locations/:locationId/bookings/:id/status      change status                  @LocationRbac(OWNER, STAFF)
PATCH  /locations/:locationId/bookings/:id/cancel      cancel                         @LocationRbac(OWNER, STAFF)
DELETE /locations/:locationId/bookings/:id             delete                         @LocationRbac(OWNER) → 204
GET    /locations/:locationId/bookings/export          xlsx stream                    @LocationRbac(OWNER, STAFF)
GET    /locations/:locationId/bookings/aggregates      aggregates                     @LocationRbac(OWNER, STAFF)
```
- The client referenced in a booking must belong to the **brand that owns `:locationId`** (resolve brand from
  location) — see Phase 5.1.

### Booking channels — location-scoped (each location has its own public page/widget)
```
POST|GET|PUT|DELETE  /locations/:locationId/booking-pages[/:id]        @LocationRbac(...)
POST|GET|PUT|DELETE  /locations/:locationId/booking-widgets[/:id]      @LocationRbac(...)
# public (no auth) — keyed by slug / widget id, unchanged externally but resolve to a location
GET                  /public/booking-pages/:slug
GET                  /public/booking-widgets/:id
```

### Payroll — location-scoped. Base path `/locations/:locationId/...`
```
POST|GET|PUT|DELETE  /locations/:locationId/payroll-periods[/:id]      @LocationRbac(OWNER[, STAFF])
# calc/approve/pay transitions on a period
POST                 /locations/:locationId/payroll-periods/:id/calculate|approve|pay   @LocationRbac(OWNER)
GET|POST             /locations/:locationId/staff-earnings[...]        @LocationRbac(OWNER, STAFF)
GET|PUT              /locations/:locationId/staff/:staffId/compensation @LocationRbac(OWNER[, STAFF])
```
- Period/earning currency follows the location (`StaffEarning.currency`, `PayrollPeriod.currency` already
  per-row). No cross-location aggregation that blind-sums different currencies.

### Dashboard / analytics — location-scoped by default
```
GET  /locations/:locationId/dashboard/widgets          @LocationRbac(OWNER)
GET  /locations/:locationId/staff/:id/kpi              @LocationRbac(OWNER, STAFF)
GET  /locations/:locationId/.../analytics              @LocationRbac(...)
# brand-wide rollups (future): GET /brands/:brandId/dashboard/... grouped by location & currency
```

---

## 8. Definition of done

- Brand and Location modules with full CRUD; immutable anchors enforced server-side.
- Two-level authorization (brand + location) across all domains; cross-location access correctly denied.
- Token-epoch auto-refresh working end-to-end with a documented FE contract.
- All operational data location-scoped; clients brand-scoped; multi-location brand demonstrable.
- `npm run build`, `npm run test`, `npm run lint` all green.
