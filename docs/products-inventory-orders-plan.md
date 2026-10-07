# Products, Inventory, and Internal Orders

## 1. Outcome and scope

Build an internal, location-scoped product sales and stock-control workflow for service businesses. There is
no public storefront, checkout, acquiring, cash drawer, fiscalization, coupons, or pricing-policy engine in
this delivery.

The first release deliberately keeps the existing service-sale flow intact:

- `BookingItem` remains the source of service revenue and service commission. It already stores
  `listPrice`, `chargedPrice`, and independent `customPrice` correctly.
- `Order` is the commercial aggregate for internal product sales. It may be linked to a booking and client,
  but this release only posts product lines.
- Dashboard total revenue combines non-overlapping sources: booking service revenue plus posted product
  order revenue.
- Payroll service commission continues to come from completed booking items; product commission comes from
  posted order items. The old manual `payroll/product-sales` endpoint remains an external/manual fallback and
  is not called by the order flow.

This boundary avoids double-counting while leaving a future migration path to a unified checkout and payment
aggregate.

## 2. Business and UI flows

### 2.1 Product catalogue

The owner manages one brand-level product card and enables it independently in each location.

Catalogue list UI needs:

- search by name, SKU, or barcode;
- filters by category, status, sale availability, stock tracking, and low-stock state;
- visible location sale price, on-hand quantity, average cost, and stock value;
- barcode scanner input that behaves like exact barcode search;
- create, full edit, archive/reactivate, and open movement history.

The brand-level card owns identity (`name`, `SKU`, `barcode`, category, unit, image). `ProductLocation` owns
location policy (`retailPrice`, active state, stock tracking, reorder level). A product can therefore be sold
at different prices and stocked differently by location without duplicate catalogue cards.

### 2.2 Counter sale

The owner or staff opens an order from either the general Orders screen or a booking checkout panel:

1. Select/scan products and quantities.
2. Optionally attribute each line to a seller for product commission.
3. An owner may set a manual `customUnitPrice`; staff use the catalogue price.
4. Save the open order and continue editing it after the visit if needed.
5. Post the order when the sale is accepted.

An open order does not reserve stock. Posting rechecks stock atomically, creates immutable stock movements,
materializes product commission, and freezes the order snapshot. This matches an internal counter-sale flow
without pretending that payment or fiscal receipt handling exists.

### 2.3 Receiving and write-off

Inventory operations are multi-line documents so the UI can receive or write off several products in one
action. The user creates an open document, edits it with `PUT`, then posts it with a status `PATCH`.

- Receipt captures quantity, unit cost, date, optional supplier/reference text, and comment.
- Write-off captures quantity and mandatory reason.
- Adjustment captures a signed quantity delta and mandatory reason.
- Stocktake captures counted quantity; posting derives the variance.
- Transfer captures source and destination locations in the same brand and posts paired movements.

Posted documents are immutable. A mistake is corrected by voiding where allowed or by a reversing document;
ledger rows are never edited or deleted.

### 2.4 Returns and voids

An open order may be deleted. A posted order may be voided only as a full reversal in this release. Voiding:

- creates positive `SALE_REVERSAL` inventory movements;
- reverses product commission idempotently;
- excludes the order from revenue analytics.

Partial returns, payment refunds, and fiscal corrections belong to the later Payments/Cash delivery and are
not simulated here.

## 3. Inventory coverage

The feature must answer the key operational questions:

| Business question                             | Source                                               |
| --------------------------------------------- | ---------------------------------------------------- |
| What is physically on hand now?               | `InventoryBalance.quantityOnHand`                    |
| What is running low?                          | balance compared with `ProductLocation.reorderLevel` |
| Why did stock change?                         | immutable `InventoryMovement` ledger                 |
| What did the current stock cost?              | weighted-average `averageUnitCost`                   |
| What was product COGS at sale time?           | `OrderItem.unitCostSnapshot`                         |
| What is current stock value?                  | on-hand quantity times average unit cost             |
| What was received/written off/count-adjusted? | posted inventory documents                           |
| How did stock move between locations?         | paired transfer movements with one document          |
| Can two users sell the last unit?             | atomic conditional balance update at order posting   |
| Can a retry duplicate a movement/commission?  | unique source/idempotency keys                       |

Quantity uses `Decimal(14,3)` to support pieces and fractional consumables. Money uses the existing
`MoneyService` and two-decimal decimal columns. Negative stock is forbidden. Products with stock tracking
disabled may be sold without a balance and produce no stock movement.

Deferred inventory capabilities: supplier directory, purchase orders, batches, expiry dates, serial numbers,
service recipes/automatic consumable write-off, stock reservations, and configurable negative stock.

## 4. Domain ownership

### ProductsModule

Owns `ProductCategory`, `Product`, and `ProductLocation`. It exposes named operations to resolve a sellable
product, validate location settings, and return catalogue/search views. Other modules never query these tables.

### InventoryModule

Owns `InventoryBalance`, `InventoryDocument`, `InventoryDocumentItem`, and `InventoryMovement`. It exposes
receipt/write-off/adjustment/stocktake/transfer lifecycle operations and order stock posting/reversal.

### OrdersModule

Owns `Order` and `OrderItem`. It resolves products through `ProductsService`, validates seller attribution
through `StaffService`, changes stock through `InventoryService`, and records commission through
`StaffEarningsService`. It does not query product, stock, staff, booking, or payroll tables directly.

### Analytics

`OrdersAnalyticsService` is the public read API for posted product-sale aggregates. Dashboard and client
analytics combine its output with booking aggregates. Service analytics remain service-only. Inventory
analytics come from `InventoryService`; consumers do not query its tables directly.

## 5. Data and lifecycle invariants

- Product SKU and barcode, when present, are unique inside a brand.
- A product has at most one `ProductLocation` per location.
- An order and every line belong to one location and one currency.
- `OrderItem.listUnitPrice`, `customUnitPrice`, `unitPrice`, title/SKU, and unit cost are snapshots.
- `unitPrice = customUnitPrice ?? listUnitPrice`; there is no `priceSource` field.
- Only an owner can set or clear `customUnitPrice`; this is not a discount or coupon.
- Order totals are always computed server-side from line snapshots.
- Only `OPEN` orders and inventory documents are editable via `PUT`.
- Status transitions use dedicated `PATCH .../status` endpoints.
- `POSTED` financial and inventory records are immutable.
- Posting and voiding are idempotent.
- Stock cannot become negative under concurrent posting.
- Locked/approved payroll periods reject commission mutations for their dates.

## 6. API conventions

Resource edits use `PUT`; `PATCH` is reserved for status transitions and narrow state commands.

```text
POST   /brands/:brandId/product-categories
GET    /brands/:brandId/product-categories
PUT    /brands/:brandId/product-categories/:id
DELETE /brands/:brandId/product-categories/:id

POST   /brands/:brandId/products
GET    /brands/:brandId/products
GET    /brands/:brandId/products/:id
PUT    /brands/:brandId/products/:id
DELETE /brands/:brandId/products/:id

PUT    /locations/:locationId/products/:productId
GET    /locations/:locationId/products
GET    /locations/:locationId/inventory
GET    /locations/:locationId/inventory/:productId/movements

POST   /locations/:locationId/inventory/documents
GET    /locations/:locationId/inventory/documents
GET    /locations/:locationId/inventory/documents/:id
PUT    /locations/:locationId/inventory/documents/:id
PATCH  /locations/:locationId/inventory/documents/:id/status

POST   /locations/:locationId/orders
GET    /locations/:locationId/orders
GET    /locations/:locationId/orders/:id
PUT    /locations/:locationId/orders/:id
DELETE /locations/:locationId/orders/:id
PATCH  /locations/:locationId/orders/:id/status
```

All search endpoints extend `PaginationRequestDto`/`PaginationResponseDto`; all normal responses use
`BaseResponseDto.success(...)`; DELETE returns 204. Controllers map Prisma models/views to DTOs.

## 7. Dashboard, analytics, and payroll correctness

For a selected range:

```text
actualRevenue = completedBookingServiceRevenue + postedProductOrderRevenue
forecastRevenue = confirmedBookingServiceRevenue
totalRevenue = actualRevenue + forecastRevenue
```

Dashboard rules:

- `REVENUE_COMPLETED`: completed booking service revenue plus posted product order revenue.
- `REVENUE_TOTAL`: confirmed/completed booking service revenue plus posted product order revenue.
- `REVENUE_SERIES`: merge booking and product-order buckets by timestamp.
- `AVG_TICKET`: numerator above; denominator is completed bookings plus standalone posted orders. An order
  linked to a booking adds revenue to that visit but does not add another ticket.
- `REVENUE_BY_STAFF`: merge booking service revenue and attributed product-line revenue.

Client analytics adds posted product revenue to a client's completed-service revenue. A client with only a
standalone product order counts as an active paying client for revenue-per-client, but product purchases do
not manufacture a service visit or alter retention/recency visit metrics.

Payroll rules:

- service earnings remain keyed by `bookingItemId`;
- product earnings become keyed by `orderItemId`;
- amount is calculated from the final product line amount (`unitPrice * quantity`);
- repeated posting returns the same earning;
- void creates exactly one reversal;
- payroll reports need no formula change because they already aggregate `StaffEarning` by type;
- approved/paid period protections apply to order commission and reversal dates.

Regression tests must prove all combinations, especially linked versus standalone product orders and voids.

## 8. Delivery phases

Every phase follows: plan check, design check, implementation, tests, review, refactor, cleanup, green build,
green tests, lint, and one focused commit. No later phase starts on a red baseline.

Implementation status: all five phases are complete. Migrations through
`20261007200000_product_sales_analytics` are applied to the stage database. The completed phase commits are
listed below so the design can be traced to its implementation.

### Phase 0 - Architecture document

- Record business flows, UI contracts, ownership, invariants, analytics formulas, and exclusions.
- Commit: `docs/products-inventory-orders-plan`.
- Completed in `7d6bf5d`.

### Phase 1 - Product catalogue

- Add product enums/models/migration and Prisma generation.
- Implement categories, products, location settings, search, DTO mapping, RBAC, errors, and audit events.
- Use `PUT` for updates and `PATCH` only for status if a dedicated transition is exposed.
- Add service/controller tests and verify build/test/lint.
- Commit: `feature/product-catalog`.
- Completed in `36981bc`.

### Phase 2 - Inventory ledger

- Add balances, documents, items, movements, weighted-average costing, and migration.
- Implement receipt, write-off, adjustment, stocktake, transfer, reversal, low-stock, valuation, and movement
  history.
- Add concurrency/idempotency/unit tests and verify build/test/lint.
- Commit: `feature/inventory-ledger`.
- Completed in `f0a7575`.

### Phase 3 - Internal product orders

- Add orders/order items and product-sale relations to earnings.
- Implement open-order editing, owner custom price, totals, posting, void, stock changes, and product
  commission.
- Replace no internal behavior of bookings; keep the manual product commission endpoint as compatibility API.
- Add lifecycle, permission, concurrency, idempotency, and reversal tests.
- Commit: `feature/internal-product-orders`.
- Completed in `0a8ded8`.

### Phase 4 - Dashboard, analytics, and payroll integration

- Add `OrdersAnalyticsService` aggregates and merge them into dashboard revenue/ticket/staff widgets.
- Extend client revenue analytics without altering visit/retention semantics.
- Extend payroll DTO/source links for order items and verify report totals.
- Add cross-domain regression tests for posting and voiding.
- Commit: `feature/product-sales-analytics`.
- Completed in `5df7579`.

### Phase 5 - Final review and cleanup

- Review ownership boundaries, routes, Swagger contracts, error codes, audit rendering, indexes, and migration.
- Run Prisma validation/generation, build, all unit tests, lint, and e2e tests where infrastructure permits.
- Remove dead code and document any deliberately deferred work.
- Commit: `refactor/product-sales-hardening`.
- Completed after final schema, API, ownership, audit, test, and migration review.

## 9. Deferred roadmap

The next commercial layer is Payments/Cash, not part of this implementation:

- payments and split tenders;
- cash registers, shifts, deposits, withdrawals, and reconciliation;
- fiscal receipts and external provider retries;
- partial returns/refunds;
- pricing pipeline with multiple ordered policies/coupons and persisted calculation trace;
- service and bundle lines migrated into a unified posted order when the payment layer needs one bill.
