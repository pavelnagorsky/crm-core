# Order redesign audit

## Current state

- `Order` is a product-sale aggregate with order-level status `OPEN / POSTED / VOIDED`.
- `OrderItem` already supports `PRODUCT / SERVICE / BUNDLE / CUSTOM`, but only product lines are created by the API today.
- `OrdersService.update` deletes and recreates all order items, which is safe only for draft product orders.
- Product posting is order-level: `POSTED` writes inventory `SALE` movements and product commission earnings for every item.
- `Booking` completion is handled in `BookingsService` and `BookingCronService` through `StaffEarningsService` directly.
- Completed bookings do not create commercial `OrderItem` service rows yet.
- `Order.bookingId` is nullable but not unique, so one booking can currently have several linked orders.
- `StaffEarning` already has optional `orderId` and `orderItemId`, but service commissions are linked only by `bookingId` and `bookingItemId`.
- `InventoryService.postSale` and `reverseSale` are idempotent by movement keys and can be reused for product item confirmation.

## Target model changes

- Replace order-level posting with `OrderStatus.ACTIVE / VOIDED`.
- Add `OrderItemStatus` with `DRAFT / CONFIRMED / REVERSED`.
- Add `OrderItem.bookingItemId`, `status`, `confirmedAt`, `occurredAt`, and indexes for booking item lookup.
- Add a relation from `OrderItem` to `BookingItem`.
- Make `Order.bookingId` unique for non-null values; PostgreSQL permits multiple `NULL` values on a unique index.
- Add `OrderItemAdjustment` only if service/product corrections cannot be represented by preserved rows plus existing earning and inventory reversals. First implementation can use row status and existing movement/earning history.

## Service boundaries

- `BookingsService` must not know how commercial rows are built.
- `OrdersService` should expose public domain operations:
  - `syncCompletedBooking(...)`
  - `reverseCompletedBookingServices(...)`
  - `ensureForBooking(...)`
  - `addDraftProductToBookingOrder(...)`
  - `confirmProductItem(...)`
- To avoid a `BookingsModule` <-> `OrdersModule` circular import, split read-only booking validation out of `BookingsService` or move booking commerce orchestration into a third module imported by both. Do not use `forwardRef`.
- Inventory remains owned by `InventoryService`; product confirmation calls `InventoryService.postSale`.
- Payroll remains owned by `StaffEarningsService`; service commission creation must accept optional `orderItemId`.

## Migration plan

1. Rebuild schema and migrations for the target model.
2. Reset the development database.
3. Update seed data for active orders, draft/confirmed item rows, and completed booking service rows.
4. Link service earnings to `orderItemId` in the same transaction that creates/confirms service order items.

## Clean architecture rules

- APIs use the new commercial model directly; there are no legacy `POSTED` bridges.
- Product and service confirmation happens per `OrderItem`, not per whole `Order`.
- Replacing an order may update only draft lines; confirmed/reversed rows are history and are never overwritten.
- `Order` is not a payment. `CONFIRMED` means a commercial fact, not a payment fact.
- Product draft lines do not touch inventory or payroll.

## Required test coverage

- Booking creation does not create an order unless product draft items are requested.
- Completing a booking creates exactly one order and one confirmed service item per booking item.
- Repeating completion is idempotent.
- Leaving `COMPLETED` reverses service commercial rows and service earnings, but does not reverse product sales.
- Updating a completed booking item price creates a commercial correction path and payroll correction.
- Product draft creation inside a booking reuses the booking order.
- Standalone product sale creates an order with `bookingId = null`.
- Confirming a product item posts inventory and product commission exactly once.
- Two concurrent completion requests cannot create two orders for one booking.
