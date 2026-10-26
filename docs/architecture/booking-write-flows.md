# Booking writes

`BookingCreateFacade` coordinates public and manual creation. It checks visibility,
rate limits and client permissions, resolves the selection and schedule, then
reserves the booking. Public client bans are checked before staff resolution;
manual clients are resolved after completion permission checks. Audit and client
notifications follow a successful reservation.

Booking channels (`source`) are `PUBLIC_PAGE` (online), `WIDGET` and `MANUAL`.
Manual bookings can use custom time ("Произвольное время") by setting
`isCustomTime: true` in `POST /locations/:locationId/bookings/manual`. This
optional flag defaults to false, is persisted on the booking and is returned in
booking detail/search responses. The channel remains `MANUAL`.

Bookings with custom time accept an optional actual `endAt`, confirm ongoing
visits and complete elapsed visits with the usual order/payroll sync and
completion permission check. Ordinary manual bookings keep the location's
confirmation policy. The migration restores `isCustomTime: true` for historical
bookings identified by their legacy source in a `BOOKING_CREATED` audit entry.
Other existing bookings default to false; previously unsaved flags cannot be
inferred reliably without that evidence.

`PUT /locations/:locationId/bookings/:id` accepts optional `isCustomTime`. Omitting
it preserves the current value; true/false updates it without changing the
channel, status or interval. Only `MANUAL` bookings can have `isCustomTime: true`.

| Service | Responsibility |
| --- | --- |
| `BookingSelectionService` | Resolve active services or a bundle and quote service/product prices. Fixed bundle prices are allocated across services with the remainder on the final item. |
| `BookingSchedulingService` | Build sequential or parallel item intervals and choose available staff, preferring the least booked when no staff is requested. |
| `BookingReservationService` | Lock the location and staff days, recheck availability, create calendar events and booking items, and sync orders/payroll in one transaction. |
| `BookingMutationService` | Update client details, notes and item prices, add products, and delegate scheduling or lifecycle changes. |
| `BookingRescheduleService` | Prepare moved intervals and persist calendar events and booking items through one transaction path. |
| `BookingClientService` | Client-token slot discovery, cancellation and rescheduling from the booking resolved by authentication. Preserves staff, services, durations and prices. |
| `BookingLifecycleService` | Change status, complete elapsed bookings, cancel and soft-delete bookings with their order/payroll effects. |
| `BookingWriteLockService` | Lock active locations and reject booking edits if status or `updatedAt` changed since reading. |
| `BookingSlotLockService` | Acquire deduplicated staff/day advisory locks in a stable order and recheck availability using the transaction. |
| `BookingEventsService` | Build booking audit payloads and send creation/status notifications. |

Changing `startAt` or `staffId` moves the existing item intervals and checks slot
availability. Providing `endAt` explicitly selects a manual interval: sequential
items share its duration proportionally, parallel items use the entire interval,
and availability checks are skipped. Both paths validate staff capability, lock
staff days and reject concurrent booking edits. Future intervals also require an
active location.

All helpers are private providers of `BookingsModule`. Staff, calendar, client,
location, catalog, order and payroll data is accessed through the owning services.

`BookingClientController` owns `/public/bookings/me`. Its JWT strategy resolves
the active booking once; `ClientBooking` passes that snapshot to domain operations.
`BookingRescheduleService.rescheduleByClient` exposes only a new start time and
rechecks staff eligibility, availability and time restrictions before writing.
Slot discovery is separate from the transactional move and is not rerun on save.

Cancellation deletes booking calendar events and clears their item references in
the same transaction. Reopening to pending/confirmed recreates events after a
fresh availability check. A move excludes every old event of the booking and
checks proposed item intervals against each other before reserving slots.

Booking lifecycle audit is published after its transaction commits. Notification
delivery still uses in-process events; see [known limitations](./README.md#оставшийся-технический-долг).
