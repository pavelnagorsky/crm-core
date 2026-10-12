# План унификации ответов mutation API

## Цель

Привести `POST` / `PUT` / `PATCH` endpoints к одному простому стилю:

- успешная mutation возвращает только идентификатор измененной сущности;
- актуальное состояние сущности фронт получает отдельным `GET`;
- `DELETE` остается `204 No Content`;
- read/search/report/preview endpoints продолжают возвращать полный DTO.

Это убирает смешанный контракт, где старые API (`location`, `staff`, часть `bookings`, часть `products`) возвращают `{ id }`, а новые API (`orders`, `inventory`, `payroll`, часть `bookings`) возвращают полный snapshot.

## Целевой контракт

Для mutation endpoints:

```ts
Promise<BaseResponseDto<IdResponseDto>>;
```

Ответ:

```json
{
  "isSuccess": true,
  "responseCode": "SUCCESS",
  "responseMessage": "Success",
  "responseValue": {
    "id": "uuid"
  }
}
```

Для `DELETE`:

```ts
Promise<void>;
```

HTTP status:

```http
204 No Content
```

## Что не меняем

Не переводим на `{ id }` endpoints, которые по смыслу являются чтением, поиском, расчетом или preview:

- `GET` endpoints;
- search/list/status-count endpoints;
- analytics endpoints;
- report/export endpoints;
- public booking setup/resolve/pricing endpoints;
- endpoints генерации токена/ссылки, если результат команды сам является полезным значением, например `{ token }`.

## Причина изменения

Mutation не должна дублировать `GET`. После создания/изменения backend подтверждает успешное выполнение и возвращает id. Если фронту нужен актуальный snapshot, он делает явный refetch.

Плюсы:

- единый предсказуемый контракт для всех mutation endpoints;
- меньше payload;
- меньше привязки команд к текущей форме detail DTO;
- меньше риска, что фронт использует неполный/случайный snapshot как источник истины;
- проще swagger и frontend client behavior.

Минус:

- фронту нужно делать дополнительный `GET` там, где раньше он использовал response mutation как свежую модель.

Это ожидаемое поведение и часть целевого стиля.

## Frontend migration rule

После успешной mutation frontend должен:

1. взять `responseValue.id`;
2. инвалидировать/обновить соответствующие query cache keys;
3. если экрану нужна детальная модель прямо сейчас, вызвать соответствующий `GET`;
4. если экран показывает список, refetch списка или точечно обновить список после получения свежей detail-модели.

Не нужно ожидать от `POST` / `PUT` / `PATCH` полного объекта сущности.

## Refetch matrix

Ниже перечислены данные, которые фронту нужно перевызвать после успешной операции.

Правило чтения:

- `required` — refetch нужен, если текущий экран продолжает показывать измененную сущность;
- `also refresh` — инвалидировать/перечитать, если на экране есть эти виджеты, списки, счетчики или связанные панели.

### Orders refetch

#### `POST /locations/:locationId/orders`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- `GET /locations/:locationId/orders`
- `GET /locations/:locationId/orders/status-counts`
- dashboard/order analytics widgets, if visible
- inventory balances/movements, if the order was created with `confirmImmediately: true`

#### `PUT /locations/:locationId/orders/:orderId`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- `GET /locations/:locationId/orders`
- order totals shown outside the detail page
- any local editor state that depends on `version`

Note: after this operation the fresh `version` comes only from `GET order`.

#### `PATCH /locations/:locationId/orders/:orderId/status`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- `GET /locations/:locationId/orders`
- `GET /locations/:locationId/orders/status-counts`
- inventory balances/movements, if confirmed product items were voided/reversed by the status change
- booking detail/search, if this order belongs to a booking and the UI shows booking payment/product state
- dashboard/order analytics widgets, if visible

#### `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/confirm`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- inventory balances for affected products
- inventory movements for affected products
- product/order analytics widgets, if visible
- booking detail, if this order is attached to a booking and booking screen shows sold products

#### `POST /locations/:locationId/orders/:orderId/items`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- `GET /locations/:locationId/orders`
- booking detail, if the order belongs to a booking and the booking screen shows order items

No inventory refresh is required for draft-only additions until items are confirmed.

#### `POST /locations/:locationId/orders/:orderId/items/confirm`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- inventory balances for affected products
- inventory movements for affected products
- product/order analytics widgets, if visible
- booking detail, if this order is attached to a booking and booking screen shows sold products

#### `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/reverse`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- inventory balances for affected products
- inventory movements for affected products
- product/order analytics widgets, if visible
- booking detail, if this order is attached to a booking and booking screen shows sold products

#### `POST /locations/:locationId/orders/:orderId/returns`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- inventory balances for returned products
- inventory movements for returned products
- product/order analytics widgets, if visible
- booking detail, if this order is attached to a booking and booking screen shows sold products

### Inventory refetch

#### `POST /locations/:locationId/inventory/documents`

Returned id: `document.id`.

Required:

- `GET /locations/:locationId/inventory/documents/:documentId`

Also refresh:

- `GET /locations/:locationId/inventory/documents`
- `GET /locations/:locationId/inventory/documents/status-counts`

No inventory balances/movements refresh is required while the document remains open.

#### `PUT /locations/:locationId/inventory/documents/:documentId`

Returned id: `document.id`.

Required:

- `GET /locations/:locationId/inventory/documents/:documentId`

Also refresh:

- `GET /locations/:locationId/inventory/documents`
- document totals shown outside the detail page

No inventory balances/movements refresh is required while the document remains open.

#### `PATCH /locations/:locationId/inventory/documents/:documentId/status`

Returned id: `document.id`.

Required:

- `GET /locations/:locationId/inventory/documents/:documentId`

Also refresh:

- `GET /locations/:locationId/inventory/documents`
- `GET /locations/:locationId/inventory/documents/status-counts`
- inventory balances for affected products
- inventory movements for affected products
- inventory report/turnover widgets, if visible
- inventory analytics widgets, if visible

### Payroll refetch

#### `POST /locations/:locationId/payroll/periods`

Returned id: `period.id`.

Required:

- `GET /locations/:locationId/payroll/periods/:id`

Also refresh:

- `GET /locations/:locationId/payroll/periods`
- `GET /locations/:locationId/payroll/periods/status-counts`
- `GET /locations/:locationId/payroll/locked-ranges`, only if the created status can affect locked ranges later after approval/payment; for plain draft creation this is not required

#### `POST /locations/:locationId/payroll/periods/:id/calculate`

Returned id: `period.id`.

Required:

- `GET /locations/:locationId/payroll/periods/:id`

Also refresh:

- `GET /locations/:locationId/payroll/periods/:id/report`
- `GET /locations/:locationId/payroll/periods/:id/earnings`
- `GET /locations/:locationId/payroll/periods`
- `GET /locations/:locationId/payroll/periods/status-counts`
- staff earnings lists/widgets, if visible

#### `POST /locations/:locationId/payroll/periods/:id/approve`

Returned id: `period.id`.

Required:

- `GET /locations/:locationId/payroll/periods/:id`

Also refresh:

- `GET /locations/:locationId/payroll/periods`
- `GET /locations/:locationId/payroll/periods/status-counts`
- `GET /locations/:locationId/payroll/locked-ranges`
- `GET /locations/:locationId/payroll/periods/:id/report`, if visible

#### `POST /locations/:locationId/payroll/periods/:id/pay`

Returned id: `period.id`.

Required:

- `GET /locations/:locationId/payroll/periods/:id`

Also refresh:

- `GET /locations/:locationId/payroll/periods`
- `GET /locations/:locationId/payroll/periods/status-counts`
- `GET /locations/:locationId/payroll/locked-ranges`
- `GET /locations/:locationId/payroll/periods/:id/report`, if visible

#### `POST /locations/:locationId/payroll/results/:id/corrections`

Returned id: `earning.id`.

Required:

- refetch the payroll period/report that contains or is affected by the corrected result

Also refresh:

- `GET /locations/:locationId/payroll/periods/:periodId`
- `GET /locations/:locationId/payroll/periods/:periodId/report`
- `GET /locations/:locationId/payroll/periods/:periodId/earnings`
- staff earnings lists/widgets, if visible
- next open payroll period, if correction lands there

### Staff earnings refetch

#### `POST /locations/:locationId/staff/:id/earnings`

Returned id: `earning.id`.

Required:

- refetch staff earnings list for this staff member

Also refresh:

- payroll period earnings/report, if the earning is attached to a period
- payroll period detail/search/status-counts, if visible
- payroll locked ranges are not affected by a draft earning itself

#### `POST /locations/:locationId/payroll/product-sales`

Returned id: `earning.id`.

Required:

- refetch staff earnings list for the affected staff member

Also refresh:

- payroll period earnings/report, if the earning is attached to a period
- product/order sales widgets, if visible

### Staff compensation refetch

#### `PUT /locations/:locationId/staff/:id/compensation`

Returned id: `compensationPlan.id`.

Required:

- `GET /locations/:locationId/staff/:id/compensation/current`

Also refresh:

- `GET /locations/:locationId/staff/:id/compensation`
- staff detail, if it shows compensation summary
- payroll calculate/report screens, if they cache compensation-derived values

### Bookings refetch

#### `PUT /locations/:locationId/bookings/:id`

Returned id: `booking.id`.

Required:

- `GET /locations/:locationId/bookings/:id`

Also refresh:

- `GET /locations/:locationId/bookings`
- calendar view for the affected date/staff
- available slots, if the UI keeps slot suggestions open
- booking analytics/status widgets, if visible
- related order, if the booking is completed and price changes sync into an order
- staff earnings/payroll views, if the booking is completed and earnings were synced

#### `POST /locations/:locationId/bookings/:id/products`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- `GET /locations/:locationId/bookings/:id`, if booking detail shows related order/products
- order search/list, if visible

No inventory balances/movements refresh is required for draft product additions until items are confirmed.

#### `POST /locations/:locationId/bookings/:id/items`

Returned id: `order.id`.

Required:

- `GET /locations/:locationId/orders/:orderId`

Also refresh:

- `GET /locations/:locationId/bookings/:id`, if booking detail shows related order/products
- order search/list, if visible

No inventory balances/movements refresh is required for draft product additions until items are confirmed.

### Products refetch

#### `PUT /locations/:locationId/products/:productId`

Returned id: `productLocation.id`.

Required:

- refetch location product list/search that contains this product

Also refresh:

- product detail, if visible
- inventory balances list/search, if it displays product settings such as status, tracking or reorder level
- booking/order product pickers, if they cache product availability/settings

If a dedicated location-product detail endpoint is added later, use it as the required refetch target.

## Затронутые области

### Orders

Сейчас `orders` mutation endpoints возвращают `OrderResponseDto`.

Целевой стиль: возвращать `IdResponseDto` с `order.id`.

Endpoints:

- `POST /locations/:locationId/orders`
- `PUT /locations/:locationId/orders/:orderId`
- `PATCH /locations/:locationId/orders/:orderId/status`
- `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/confirm`
- `POST /locations/:locationId/orders/:orderId/items`
- `POST /locations/:locationId/orders/:orderId/items/confirm`
- `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/reverse`
- `POST /locations/:locationId/orders/:orderId/returns`

Frontend refetch:

- `GET /locations/:locationId/orders/:orderId`
- при необходимости также refetch order search/status-counts.

Важно для фронта:

- после `PUT` новый `version` больше не приходит в mutation response;
- если пользователь продолжает редактирование того же заказа, нужно refetch order перед следующей version-sensitive mutation.

### Inventory

Сейчас inventory document mutations возвращают `InventoryDocumentResponseDto`.

Целевой стиль: возвращать `IdResponseDto` с `document.id`.

Endpoints:

- `POST /locations/:locationId/inventory/documents`
- `PUT /locations/:locationId/inventory/documents/:documentId`
- `PATCH /locations/:locationId/inventory/documents/:documentId/status`

Frontend refetch:

- `GET /locations/:locationId/inventory/documents/:documentId`
- после posting/voiding также refetch inventory balances, movements, document search/status-counts по необходимости.

### Payroll periods

Сейчас payroll period actions возвращают `PayrollPeriodResponseDto`.

Целевой стиль: возвращать `IdResponseDto` с `period.id`.

Endpoints:

- `POST /locations/:locationId/payroll/periods`
- `POST /locations/:locationId/payroll/periods/:id/calculate`
- `POST /locations/:locationId/payroll/periods/:id/approve`
- `POST /locations/:locationId/payroll/periods/:id/pay`

Frontend refetch:

- `GET /locations/:locationId/payroll/periods/:id`
- для экранов ведомости также refetch report/earnings/search/status-counts по необходимости.

Особенно важно:

- `calculate` больше не возвращает results в response;
- после расчета фронт должен refetch period detail или report.

### Payroll corrections / earnings

Сейчас correction endpoint возвращает `StaffEarningResponseDto`.

Целевой стиль: возвращать `IdResponseDto` с `earning.id`.

Endpoint:

- `POST /locations/:locationId/payroll/results/:id/corrections`

Frontend refetch:

- refetch affected payroll period/report/earnings lists.

### Staff earnings

Сейчас manual earning/product-sale earning mutations возвращают `StaffEarningResponseDto`.

Целевой стиль: возвращать `IdResponseDto` с `earning.id`.

Endpoints:

- `POST /locations/:locationId/staff/:id/earnings`
- `POST /locations/:locationId/payroll/product-sales`

Frontend refetch:

- refetch staff earnings lists;
- refetch payroll locked/period/report data, если экран зависит от них.

### Staff compensation

Сейчас compensation replace endpoint возвращает `CompensationPlanResponseDto`.

Целевой стиль: возвращать `IdResponseDto` с `compensationPlan.id`.

Endpoint:

- `PUT /locations/:locationId/staff/:id/compensation`

Frontend refetch:

- refetch current compensation plan;
- refetch compensation history;
- refetch staff/payroll screens, если они показывают compensation-derived данные.

### Bookings

Часть bookings уже возвращает `IdResponseDto`, часть возвращает full DTO.

Целевой стиль: все booking/order mutations возвращают id.

Endpoints для перевода:

- `PUT /locations/:locationId/bookings/:id`
- `POST /locations/:locationId/bookings/:id/products`
- `POST /locations/:locationId/bookings/:id/items`

Остаются как есть:

- `POST /locations/:locationId/bookings/manual` уже возвращает booking id;
- `PATCH /locations/:locationId/bookings/:id/status` уже возвращает booking id;
- `POST /locations/:locationId/bookings/:id/cancel` уже возвращает booking id;
- `POST /public/bookings/me/cancel` уже возвращает booking id;
- `POST /locations/:locationId/bookings/:id/client-token` возвращает `{ token }`, это не entity snapshot.

Frontend refetch:

- после booking update: `GET /locations/:locationId/bookings/:id`;
- после adding booking products/items: refetch related order through `GET /locations/:locationId/orders/:orderId`, using returned order id;
- если экран booking detail должен показать связанные продажи, refetch соответствующий booking/order state.

### Products

Большая часть product/category mutations уже возвращает `IdResponseDto`.

Остается привести location product settings.

Endpoint:

- `PUT /locations/:locationId/products/:productId`

Целевой стиль:

- вернуть `IdResponseDto`;
- id должен быть id строки `ProductLocation`, если фронту нужна именно настройка location-product;
- если фронту удобнее работать от product id, это нужно явно согласовать до изменения.

Frontend refetch:

- refetch location product search/list;
- при наличии detail endpoint для location-product refetch detail; если detail endpoint отсутствует, refetch list/search.

## Backend checklist

Для каждого endpoint:

- заменить Swagger response с full DTO на `ApiResponse(IdResponseDto)`;
- заменить return type на `Promise<BaseResponseDto<IdResponseDto>>`;
- вернуть `BaseResponseDto.success({ id: entity.id })`;
- удалить неиспользуемый import full response DTO из controller, если он больше не нужен;
- оставить service contracts без обязательного изменения, если сервису все еще удобно возвращать Prisma model/aggregate;
- не менять `GET` DTO и search DTO;
- обновить/добавить controller tests, если они проверяют shape response.

## Frontend checklist

Для каждого affected mutation:

- не читать поля entity из mutation response;
- читать только `responseValue.id`;
- настроить query invalidation;
- добавить явный detail/list refetch там, где экрану нужен актуальный snapshot;
- проверить flows, где сразу после mutation делается следующая mutation с optimistic/concurrency version.

Особые места для проверки:

- order edit после `PUT`, потому что новый `version` теперь приходит только через `GET order`;
- order item confirm/reverse/return, потому что totals/items/statuses теперь приходят через refetch;
- inventory posting/voiding, потому что balances/movements/status-counts требуют refetch;
- payroll calculate, потому что results теперь приходят через `GET period` или report endpoint;
- booking product add, потому что response id относится к order, а не booking.

## Suggested rollout

1. Согласовать этот контракт с frontend.
2. Обновить frontend так, чтобы он не зависел от full mutation snapshots.
3. После этого изменить backend controllers и Swagger.
4. Прогнать backend tests.
5. Прогнать frontend flows:
   - create/update/order;
   - confirm/reverse/return order item;
   - create/post/void inventory document;
   - calculate/approve/pay payroll period;
   - update booking;
   - add booking products/items;
   - product location settings.

## Итоговое правило

`POST` / `PUT` / `PATCH` подтверждают команду и возвращают id.
`GET` возвращает актуальное состояние.
