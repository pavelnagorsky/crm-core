# Booking writes

`BookingCreateFacade` coordinates public and manual creation. It checks visibility,
rate limits and client permissions, resolves the selection and schedule, then
reserves the booking. Public client bans are checked before staff resolution;
manual clients are resolved after completion permission checks. Audit and client
notifications follow a successful reservation.

| Service | Responsibility |
| --- | --- |
| `BookingSelectionService` | Resolve active services or a bundle and quote service/product prices. Fixed bundle prices are allocated across services with the remainder on the final item. |
| `BookingSchedulingService` | Build sequential or parallel item intervals and choose available staff, preferring the least booked when no staff is requested. |
| `BookingReservationService` | Lock the location and staff days, recheck availability, create calendar events and booking items, and sync orders/payroll in one transaction. |
| `BookingMutationService` | Update client details, notes and item prices, add products, and delegate scheduling or lifecycle changes. |
| `BookingRescheduleService` | Prepare moved intervals and persist calendar events and booking items through one transaction path. |
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

Cancellation deletes booking calendar events and clears their item references in
the same transaction. Reopening to pending/confirmed recreates events after a
fresh availability check. A move excludes every old event of the booking and
checks proposed item intervals against each other before reserving slots.

Booking lifecycle audit is published after its transaction commits. Notification
delivery still uses in-process events; see the review limitations in README.md.
