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

Changing `startAt`, `staffId` or item `staffAssignments` moves the existing item intervals and checks slot
availability. Every member of the proposed team must still be active, belong to
the location and perform their assigned service; this is rechecked inside the
transaction for both CRM and client moves, matching calendar slot discovery.
Providing `endAt` explicitly selects a manual interval: sequential
items share its duration proportionally, parallel items use the entire interval,
and availability checks are skipped. Explicit staff replacements validate
capability in both paths. Both paths lock staff days and reject concurrent
booking edits. Future intervals also require an active location.

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

## Parallel bundle teams

A parallel bundle remains one booking with its bundle price. Each service starts
at the same time, uses a distinct staff member and reserves its own duration plus
buffer. The booking interval covers all item intervals. No additional table or
migration is required.

Creation, selection resolve and slot discovery accept optional `staffAssignments`
with `{ serviceId, staffId? }`. Missing entries, omitted/null staff ids and an empty
array request automatic assignment. JSON requests use an array; GET slot requests
use a URL-encoded JSON string, limited to 4096 characters and ten unique services.
UUIDs, selection membership, staff location/activity and qualification are checked.
A global `staffId` cannot assign multiple parallel services. Combining a nonempty
assignment array with a global staff id, or conflicting legacy manual item staff,
is rejected. Legacy `items[].staffId` still supports repeated services separately.

`shared/scheduling/assign-staff.ts` finds a complete matching with augmenting paths.
It is a pure helper shared by booking scheduling and the private calendar
calculator. Both first filter candidates against each item's interval. Scheduling
ranks candidates by one combined booking-count query, then staff id; preferences
never prevent a valid team from being found. Neither module imports the other's
private computation providers.

Resolve returns `PER_SERVICE`, `staffByService` and `canAssignStaff` for parallel
bundles. The last field describes qualification, not time availability. Optional
`startAt` resolves the actual team and intervals into `resolvedItems`; optional
`endAt` previews the existing manual-interval behavior. Resolve has no reservation
or client mutation side effects. CRM submits the displayed team explicitly.
Availability is checked again under transaction locks, so a stale preview fails
with 409 before any events or booking items are created.

Update assignments use `{ bookingItemId, staffId }`. Unspecified items keep their
staff, and moving the start preserves saved offsets, durations and prices. Manual
slot discovery with `bookingId` also uses the saved items rather than the current
catalog, excluding every previous event. It retains manual scheduling's exemption
from public notice/advance limits. Client-token moves retain public restrictions.
To preview replacements on a saved booking, manual slots accept
`itemStaffAssignments` as a URL-encoded JSON array of `{ bookingItemId, staffId }`.
These are the same explicit replacements sent as `staffAssignments` on update.
Omitted items keep their staff; using saved item IDs also supports repeated services.
This query requires `bookingId` and cannot be mixed with service-level assignments
or a global staff ID. It has the same JSON length and item-count limits as creation.
An explicit `endAt` keeps the existing manual update behavior, but overlapping
items can never be assigned to the same staff member.

CRM creation/editing and the shared public booking form display staff per service.
Assignment values are normalized in query keys; changing the team clears selected
time. Parallel bundle availability in the editor checks for a complete team.
Lifecycle, calendar details and notifications already aggregate all booking items;
payroll uses each item's actual staff and allocated price.
