# Architecture Hardening: Bookings, Calendar, and Payroll

## Scope

This delivery implements architecture review items 1, 4, 5, and 6:

- make booking state and payroll earnings transactionally consistent;
- enforce table ownership across bookings, calendar, staff, and services;
- remove the `BookingsModule` cycles with calendar and booking channels;
- keep every exception response code a string.

The parallel analytics aggregate rename and review item 7 are intentionally outside this change set.

## Stage 1: Exception contract

Status: complete (`fix/http-exception-response-code`).

- Unmapped `HttpException` statuses use `INTERNAL_ERROR.code`, not the whole error descriptor.
- A regression test asserts the serialized `responseCode` contract.

## Stage 2: Booking and payroll transaction

Status: complete (`fix/atomic-booking-earnings`).

- Completing, reopening, cancelling, or deleting a completed booking updates earnings in the same database transaction.
- Earning failures propagate and roll back the booking mutation.
- Updating price or staff on a completed booking writes a ledger correction for only the required delta.
- Reversal includes both the original commission and later booking corrections.
- A locked payroll date rejects and rolls back the related booking mutation.

These rules keep payroll, dashboard revenue, and booking analytics aligned on committed business state.

## Stage 3: Booking channel boundary

Status: complete (`refactor/booking-channel-boundary`).

- `BookingChannelsModule` owns page/widget attribution and imports `BookingsModule` in one direction.
- `BookingCreateService` receives an already resolved `BookingAttribution`.
- The public booking URL and response contract are unchanged.
- No `forwardRef` remains between bookings and booking channels.

## Stage 4: Calendar and domain boundaries

Status: complete.

- `CalendarModule` is the calendar core and owns event persistence plus pure calendar computation.
- `CalendarApiModule` composes calendar events with the booking feed for API reads.
- `BookingsModule` imports the calendar core in one direction; the calendar core does not import bookings.
- Calendar requests obtain shifts, location settings, services, and bundles through their owning services.
- Booking create/reschedule/delete uses named calendar and staff operations while preserving one open transaction.
- Booking setup and selection use `ServiceCatalogService` rather than querying service tables.
- Staff deletion relies on the database foreign-key invariant instead of querying booking items.

## Verification

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:e2e`

The health e2e test also constructs the full Nest application graph, so it guards against reintroducing the removed module cycles.
