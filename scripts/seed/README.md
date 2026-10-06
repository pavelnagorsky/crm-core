# Demo Seeds

Standalone Node ESM scripts that populate the database with realistic demo data.
They talk to Postgres through the same Prisma client + pg adapter the app uses
(`src/database/database.service.ts`) and read `DATABASE_URL` from the project `.env`.

## Run

```bash
node scripts/seed/run.mjs <seed-name>
```

Available seeds:

- `hair-salon` - realistic hair salon demo for the current brand/location model.
  It uses the first location and its parent brand, renames them for demo clarity,
  sets up 4 staff with service assignments, compensation plans, work schedules,
  lunch/one-off blocks, bookings in every status across the past ~3 months + 3
  future weeks, linked `CalendarEvent` + `BookingItem` records, earnings
  (service commission for completed booking items, hourly for elapsed shifts, and
  a fixed-salary top-up), and a payroll period per calendar month through today.

Running with no/unknown name prints the list of seeds.

## Prerequisites

- The database must already contain at least one `Brand`, one `Location`, and the
  service catalog/categories for that location.
- The seed mutates the first location returned by `createdAt ASC`. Do not run it
  against production data.

## Behavior

- **Idempotent**: each run first clears the data it generated for the selected
  brand/location (payroll periods, earnings, bookings, seeded brand clients,
  location calendar events, shifts, compensation plans, plus staff it created
  previously and tagged by `@seed.lokon` email). Seeded clients use phones
  `+375291100xxx` and are replaced on the next run. Existing clients, services,
  categories, brand, and location records are kept.
- **Deterministic**: uses a seeded RNG (`lib/random.mjs`), so repeated runs
  produce the same dataset.
- **Model-aligned**: clients are brand-scoped, while bookings, calendar events,
  staff, compensation plans, earnings, and payroll periods are location-scoped.

## Domain invariants respected

Ported from the app so seeded data matches runtime reads:

- `lib/time.mjs` - `localToUtc`, `dateOnly`, `zonedDateStr`, `@db.Time`
  encoding (from `TimeService` / `staff.service.ts parseTime`).
- Bookings: `endAt = startAt + durationMinutes`; buffer only affects packing.
- Slot packing never overlaps shifts, lunch, one-off blocks, or other bookings.
- Earnings mirror `staff-earnings.service.ts` (formula, fields,
  `idempotencyKey`, and `bookingItemId` linkage).
- Payroll periods mirror `payroll.service.ts` `calculate`: salary is prorated by
  calendar day, a guaranteed minimum pays only the top-up above hourly and
  commission, and each result locks the earnings it includes. Older months are
  `PAID`, the last closed month is `APPROVED`, the current month is `CALCULATED`.

## Add a new seed

1. Create `scripts/seed/seeds/<name>.mjs` exporting `meta` and `async seed(prisma)`.
2. Register it in `run.mjs` `SEEDS`.
