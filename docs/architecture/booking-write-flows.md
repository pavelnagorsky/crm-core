# Booking writes

`BookingCreateFacade` coordinates public and manual creation. It checks visibility,
rate limits and client permissions, resolves the selection and schedule, then
reserves the booking. Public client bans are checked before staff resolution;
manual clients are resolved after staff and status checks. Audit and client
notifications follow a successful reservation.

Public creation accepts an optional UUID `idempotencyKey`, scoped to the location.
`BookingReservationService.reserveOnce` acquires a transaction advisory lock before
client, catalog or staff preparation, then checks the stored request hash. This
lets retries return the existing booking without checking availability against
their own reservation. Hashing covers guest intent and channel attribution before
resolving mutable catalog prices, client profiles or automatic staff assignments.
The key and hash are committed with the booking and calendar events; rollback
releases the key. Replays skip creation audit and notifications. Changed intent or
a deleted booking returns `BOOKING_IDEMPOTENCY_CONFLICT`. The response includes the
current client-facing booking and a management link, including on replay.

Booking channels (`channel`, enum `BookingChannel`) are `PUBLIC_PAGE` (online),
`WIDGET` and `MANUAL`. The marketing source is separate: `trafficSource` and
`trafficSourceDetail`. Public creation takes the visitor's raw touch in `traffic`
(`PublicCreateBookingDto`); `BookingTrafficService` classifies it and the reservation
writes the source and the `BookingTrafficTouch` with the booking. `traffic` is not
part of the idempotency hash. Manual creation takes `trafficSource` and
`trafficSourceDetail` picked by staff; only manual bookings can change them later
(`BOOKING_TRAFFIC_SOURCE_READ_ONLY`). The first booking of a brand client records the
client's acquisition in the same transaction (`ClientsService.recordAcquisition`,
guarded so concurrent first bookings acquire once; imported clients never). See
[traffic-attribution.md](../traffic-attribution.md).
Manual bookings can use custom time ("Произвольное время") by setting
`isCustomTime: true` in `POST /locations/:locationId/bookings/manual`. This
optional flag defaults to false, is persisted on the booking and is returned in
booking detail/search responses. The channel remains `MANUAL`.

Bookings with custom time accept an optional actual `endAt`, confirm ongoing
visits and complete elapsed visits with the usual order/payroll sync. Custom time is the journal's "book anyway": like a
manual interval on update it skips working hours, blocks and other bookings of the
staff member (a free qualified staff member is still preferred when none is
requested); only one staff member on two overlapping services of the same
booking is rejected (`BOOKING_STAFF_ASSIGNMENT_OVERLAP`). Ordinary manual
bookings are confirmed: staff booking from the journal has already agreed.

Manual creation takes an optional `status` (`PENDING`, `CONFIRMED`, `COMPLETED`,
`NO_SHOW`) that overrides both defaults. `COMPLETED` and `NO_SHOW` need a visit
that has started (`BOOKING_STATUS_BEFORE_START`). Creating a booking as `COMPLETED`
(explicitly or by elapsed custom time) needs no permission beyond creating it, as
completing it by a status change needs none beyond managing it, and runs the same
order/payroll sync as a completion. Neither queues a client email: the creation notice is computed from the
final status. `clientId` books a stored brand client (`BOOKING_CLIENT_NOT_FOUND`
otherwise; not with `anonymous`). For a client picked by `clientId`, an email in the
request fills an empty profile email inside the reservation transaction
(`ClientsService.fillMissingEmail`), so a failed booking leaves the profile as it
was; the audit entry is published after commit. A filled email is never
overwritten. Clients found by phone and online bookings never change a profile. A
caller with only `booking.own:write` must perform one of the services; scheduling
gives that staff member every service they can take (free staff first), colleagues
take the rest.

`BookingHistoryReadService` serves the booking dialog: the client summary (brand-wide
completed visits, no-shows, last visit, last visit in the location, nearest active
booking, services and bundles by frequency) and popular services per staff member
for the last 90 days. A bundle visit counts for the bundle, a visit without a bundle
for each of its services; only `COMPLETED` visits count. Bundle titles come from
`ServiceCatalogFacade.findBundleTitles`. `CalendarFacade.checkManualSlot` explains an
unavailable start time with the earliest obstacle: `BOOKING`, `BLOCK`, `NO_SHIFT`
(no shift that day), `OUTSIDE_SCHEDULE` (the visit runs outside the shift) or
`NO_STAFF`. Before services are chosen, manual `available-slots` and `slot-check`
work on the start alone: the staff member (or anyone who performs services) must be
free for one booking step. The calendar view returns `staffClosedTime` per active
staff member next to the location-wide `closedTime`, so a staff column without a
shift is shown closed while other staff work.

The migration restores `isCustomTime: true` for historical
bookings identified by their legacy channel in a `BOOKING_CREATED` audit entry.
Other existing bookings default to false; previously unsaved flags cannot be
inferred reliably without that evidence.

`PUT /locations/:locationId/bookings/:id` accepts optional `isCustomTime`. Omitting
it preserves the current value; true/false updates it without changing the
channel, status or interval. Only `MANUAL` bookings can have `isCustomTime: true`.

| Service | Responsibility |
| --- | --- |
| `BookingSelectionService` | Resolve active services or a bundle and quote service/product prices. Fixed bundle prices are allocated across services with the remainder on the final item. |
| `BookingSchedulingService` | Build sequential or parallel item intervals and choose available staff, preferring the least booked when no staff is requested. |
| `BookingReservationService` | Lock the location and staff days, recheck availability, create calendar events, booking items and the traffic touch, record the client acquisition, and sync orders/payroll in one transaction. |
| `BookingMutationService` | Update client details, notes, item prices and the source of a manual booking, add products, and delegate scheduling or lifecycle changes. |
| `BookingClientLinkService` | Resolve a client change of a booking update and keep the clients' first booking (acquisition) right after it. |
| `BookingRescheduleService` | Prepare moved intervals and persist calendar events and booking items through one transaction path. |
| `BookingClientService` | Client-token slot discovery, cancellation and rescheduling from the booking resolved by authentication. Preserves staff, services, durations and prices. |
| `BookingLifecycleService` | Change status, complete elapsed bookings, cancel and soft-delete bookings with their order/payroll effects. |
| `BookingWriteLockService` | Lock active locations and reject booking edits if status or `updatedAt` changed since reading. |
| `BookingSlotLockService` | Acquire deduplicated staff/day advisory locks in a stable order and recheck availability using the transaction. |
| `BookingEventsService` | Build booking audit payloads and send creation/status notifications. |
| `BookingPaymentService` | Pay a visit: complete a started visit, confirm product lines and record the payment through `PaymentsFacade` in the caller's transaction. Undo a payment just recorded through `OrderPaymentsFacade.undoVisitPayment`. |
| `BookingPaymentReadService` | Amount due, active journal, payment tracking (`tracked`, by `startAt`) and draft product count of visits for the booking card and the calendar, in batches. |

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

Emails about staff changes wait out an undo window. Creating a booking from the
journal and moving it store a pending email on the booking (`clientNoticeAt`,
`clientNoticeType`, `clientNoticeFromStartAt`); the per-minute cron sends it once
the window passes and rechecks the booking first. The rules live in
`rules/booking-client-notice.rules.ts`. `BookingWriteLockService.lockUnchangedBooking`
returns the locked pending email, because the cron clears it without bumping
`updatedAt` and the copy loaded before the lock may be stale. Reminders follow
`reminderDueAt` (`rules/booking-reminder.rules.ts`), recomputed whenever a booking
becomes confirmed or moves. Client actions also reach staff:
`BookingStaffNotificationService` emails the location's managers and the booking's
staff accounts, with recipients resolved by `AccessService`.

Only confirmed bookings complete automatically. An unconfirmed request is never
completed, reminded or paid for by the cron; staff close it by hand.

## Visit payment

`PUT /locations/:locationId/bookings/:id/payment`, manual creation with `payment` and
`confirmProducts`, and `PUT /locations/:locationId/bookings/:id` with `payment` and
`confirmProductItemIds` share one rule, implemented in `BookingPaymentService`
(design: [payments-plan.md](../payments-plan.md)):

1. The payment key is locked first (`pg_advisory_xact_lock`). An earlier identical
   request returns its operation and the whole step is skipped; the same key with
   another request answers 409 `PAYMENT_IDEMPOTENCY_CONFLICT`. On creation any
   earlier use of the key is a conflict, so a retried creation creates nothing.
2. The booking is locked (`FOR UPDATE`, read again; creation and update already hold
   it). NO_SHOW or CANCELLED refuse confirming products (409
   `BOOKING_PAYMENT_NOT_ALLOWED`).
3. A paid PENDING or CONFIRMED visit that has started is completed in the same
   transaction (`BookingLifecycleService.completeInTransaction`: status, order
   services, earnings). Manual creation applies the same rule to the computed status,
   so the booking is created COMPLETED. A visit that has not started keeps its status
   (prepayment).
4. The visit order is created when missing and locked (`OrdersFacade.lockBookingOrder`),
   chosen draft products are confirmed, the amount due is computed under the lock
   (`rules/visit-payment-due.rules.ts`: services by the booking for PENDING,
   CONFIRMED and COMPLETED, plus sold products) and the payment is recorded or replaces
   the active one. `PaymentsFacade.record` first refuses a location with payment
   tracking DISABLED (409 `PAYMENT_TRACKING_DISABLED`); the ledger then checks the
   one-click expectations (`expectNoPayment`: 409 `PAYMENT_ALREADY_RECORDED`;
   `expectedAmount`: 409 `PAYMENT_AMOUNT_MISMATCH`).
5. After commit: `BOOKING_STATUS_CHANGED` for a completion, `ORDER_ITEM_CONFIRMED`,
   `PAYMENT_RECORDED` or `PAYMENT_REPLACED`.

Any error rolls everything back. Replacing an active payment needs `order:write`; a
master records the first payment of their own visit. `PATCH status` takes no payment;
cron, status changes and creation never record money. Deleting a booking with a paid
amount answers 409 `BOOKING_HAS_PAYMENTS`.

`POST /locations/:locationId/bookings/:id/payment/undo` undoes a first payment of the
visit that the caller recorded less than 10 minutes ago (no active refunds; design:
[payment-tracking-plan.md](../payment-tracking-plan.md), 3.4). Locks: booking
`FOR SHARE`, visit order `FOR UPDATE`, journal (`OrderPaymentCorrectionService`,
`PaymentLedgerService.undo`). The visit keeps its status: a visit completed by the
payment stays COMPLETED. A voided operation answers 200 without changes. A master with
`booking.own:write` must still take part in the locked visit (403), as in the payment. The update hooks of
`BookingRescheduleService` (`BookingWriteHooks`) let the key lock run first and
the payment run after the completed-visit sync, in the reschedule transaction.

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
