# Demo seeds

Standalone Node ESM scripts that populate the database with realistic demo data.
They talk to Postgres through the same Prisma client + pg adapter the app uses
(`src/database/database.service.ts`) and read `DATABASE_URL` from the project `.env`.

## Run

```bash
node scripts/seed/run.mjs <seed-name>
```

Available seeds:

- `hair-salon` — realistic hair salon: renames the business, sets up 4 staff with
  service assignments, compensation plans, work schedules, lunch/one-off blocks,
  bookings in every status across the past ~3 months + 3 future weeks (each with a
  linked `CalendarEvent` block, exactly as the runtime does), and earnings
  (service commission for completed bookings + hourly for elapsed shifts).

Running with no/unknown name prints the list of seeds.

## Behavior

- **Idempotent**: each run first clears the data it generates (earnings → bookings →
  calendar events → shifts → compensation plans, plus staff it created previously,
  tagged by `@seed.lokon` email). Clients, services and categories are read-only.
- **Deterministic**: uses a seeded RNG (`lib/random.mjs`), so repeated runs produce
  the same dataset.
- Uses the **first business** in the table (this project has a single business).

## Domain invariants respected

Ported from the app so seeded data matches runtime reads:

- `lib/time.mjs` — `localToUtc`, `dateOnly`, `zonedDateStr`, `@db.Time` encoding
  (from `TimeService` / `staff.service.ts parseTime`).
- Bookings: `endAt = startAt + durationMinutes`; buffer only affects packing.
- Slot packing never overlaps shifts, lunch, one-off blocks, or other bookings.
- Earnings mirror `staff-earnings.service.ts` (formula, fields, `idempotencyKey`).

## Add a new seed

1. Create `scripts/seed/seeds/<name>.mjs` exporting `meta` and `async seed(prisma)`.
2. Register it in `run.mjs` `SEEDS`.
