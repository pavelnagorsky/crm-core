# Frontend plan: Order ↔ Booking ↔ Product

Oct 10, 2026 · frontend implementation notes

## Зачем это нужно

Бэкенд больше не считает заказ редактируемым только когда **все** строки `DRAFT`. Новое правило: редактируемость определяется **по строке**, а не по всему заказу. Заказ можно открыть, пока он `ACTIVE`; `PRODUCT/DRAFT` можно менять, `CONFIRMED`/`REVERSED` и `SERVICE` показываются read-only.

Главная цель для фронта: кассовый экран и карточка визита должны позволять дозаказать товары поверх уже оказанных услуг, не ломая историю продаж, склад, комиссии и audit.

OpenAPI будет отдельным источником правды по точным типам. Этот документ описывает flow, состояния UI, ограничения и смысл контрактных изменений.

## Старый Flow

### Редактирование заказа

1. UI открывал заказ.
2. Если в заказе была хотя бы одна не-`DRAFT` строка, редактирование блокировалось.
3. `PUT /orders/:id` воспринимался как “заменить все строки заказа”.
4. Строки сопоставлялись фактически по товару/составу, а не по `OrderItem.id`.
5. Дозаказ товара после завершённой услуги не проходил, потому что service-line уже `CONFIRMED`.

Проблема: один проданный/подтверждённый item делал весь заказ immutable для формы, хотя новые товары ещё можно безопасно добавить как черновики.

### Товары в брони

Старый вход для добавления товара в бронь был одиночным:

```text
POST /locations/:locationId/bookings/:bookingId/products
```

Он остаётся совместимым, но для нового UI лучше использовать batch endpoint.

### Отмена брони

При отмене будущей брони draft-товары могли оставаться в заказе брони, хотя продажа ещё не состоялась. Это создавало “висящие” намерения продажи.

## Новый Flow

### Модель экрана заказа

Фронт должен разделять строки заказа на секции:

| Условие строки                         | UI-состояние          | Что можно делать                       |
| -------------------------------------- | --------------------- | -------------------------------------- |
| `type = PRODUCT`, `status = DRAFT`     | editable              | менять товар, qty, price, seller       |
| `type = PRODUCT`, `status = CONFIRMED` | read-only sold        | показать кнопку возврата через reverse |
| `type = PRODUCT`, `status = REVERSED`  | read-only returned    | только показать историю                |
| `type = SERVICE`, любой `status`       | read-only service     | не редактировать через order editor    |
| `order.status != ACTIVE`               | whole order read-only | не показывать сохранение draft changes |

Важно: `CONFIRMED` товар нельзя “удалить из формы”. Возврат проданного товара — отдельное действие через reverse endpoint с reason.

### Источник данных

Для карточки заказа брать:

```text
GET /locations/:locationId/orders/:orderId
```

Для заказа, связанного с бронью, если `orderId` неизвестен:

```text
GET /locations/:locationId/orders?bookingId=:bookingId
```

`BookingResponseDto` сейчас не содержит `orderId`. Если экран брони уже получил `OrderResponseDto` из add-items endpoint, лучше сохранить `order.id` в состоянии экрана. Для отменённой брони вход в order-card строится по `bookingId`. Для удалённой брони DELETE возвращает `204`, поэтому фронт должен сохранить контекст до удаления или дождаться отдельного backend-входа, если нужен просмотр после удаления из списка.

## Контрактные Изменения

### OrderResponse

Фронту теперь критично использовать:

```ts
type OrderResponse = {
  id: string;
  bookingId: string | null;
  status: 'ACTIVE' | 'VOIDED';
  version: number;
  items: OrderItemResponse[];
  totalAmount: string;
  // остальные поля без изменения смысла
};
```

`version` обязателен для сохранения editor-form. Это защита от lost update.

### OrderItemResponse

Ключевые поля:

```ts
type OrderItemResponse = {
  id: string;
  type: 'SERVICE' | 'PRODUCT';
  status: 'DRAFT' | 'CONFIRMED' | 'REVERSED';
  catalogItemId: string | null;
  title: string;
  quantity: string;
  customUnitPrice: string | null;
  unitPrice: string;
  lineTotal: string;
  sellerStaffId: string | null;
  sellerName: string | null;
};
```

`id` — identity строки. Не использовать `catalogItemId/productId` как identity строки в форме.

### Update Order

Новый смысл:

```text
PUT /locations/:locationId/orders/:orderId
```

Payload:

```ts
type UpdateOrderRequest = {
  version: number;
  clientId?: string | null;
  occurredAt?: string;
  note?: string | null;
  items: UpdateOrderItem[];
};

type UpdateOrderItem = {
  id?: string;
  productId: string;
  quantity: string;
  customUnitPrice?: string | null;
  sellerStaffId?: string | null;
};
```

Правила:

1. `items` — это **только желаемое итоговое множество editable draft product rows**.
2. Существующая editable строка отправляется с `id`.
3. Новая строка отправляется без `id`.
4. Editable `DRAFT` строка, отсутствующая в payload, будет удалена.
5. Read-only строки (`SERVICE`, `PRODUCT/CONFIRMED`, `PRODUCT/REVERSED`) в payload не отправлять.
6. `productId` обязателен и остаётся бизнес-атрибутом строки, но не её identity.
7. Перед отправкой брать `version` из последнего загруженного `OrderResponse`.

### Add Items To Order

Для быстрого добавления товаров без полной формы:

```text
POST /locations/:locationId/orders/:orderId/items
```

Payload:

```ts
type AddOrderItemsRequest = {
  items: OrderProductItem[];
};
```

Использовать, когда UI добавляет товары к уже открытому заказу и не редактирует весь draft-набор как desired-state.

### Add Items To Booking Order

Новый предпочтительный endpoint:

```text
POST /locations/:locationId/bookings/:bookingId/items
```

Payload такой же:

```ts
type AddOrderItemsRequest = {
  items: OrderProductItem[];
};
```

Старый endpoint остаётся совместимым:

```text
POST /locations/:locationId/bookings/:bookingId/products
```

Но новый UI должен использовать `/items`, потому что он batch-friendly и симметричен order endpoint.

## UI Правила

### Как собрать editor state

После загрузки `OrderResponse`:

```ts
const editableItems = order.items.filter(
  (item) => item.type === 'PRODUCT' && item.status === 'DRAFT',
);

const readonlyItems = order.items.filter(
  (item) => item.type !== 'PRODUCT' || item.status !== 'DRAFT',
);
```

В форму редактирования класть только `editableItems`.

Для каждой editable строки хранить:

```ts
{
  id: item.id,
  productId: item.catalogItemId,
  quantity: item.quantity,
  customUnitPrice: item.customUnitPrice,
  sellerStaffId: item.sellerStaffId
}
```

Для новой строки:

```ts
{
  (productId, quantity, customUnitPrice, sellerStaffId);
}
```

### Как сохранить

На save отправить:

```ts
{
  version: order.version,
  clientId,
  occurredAt,
  note,
  items: editableFormRows
}
```

После успешного ответа заменить локальный `order` целиком на response. Не пытаться локально “досчитать” totals/version.

### Как удалить draft-строку

Удаление в форме = убрать строку из `items` payload.

Не вызывать отдельный delete item endpoint: его нет и не нужно для draft editor-flow.

### Как вернуть проданный товар

Для `PRODUCT/CONFIRMED` показывать отдельное действие “Вернуть”.

Flow:

1. Пользователь выбирает confirmed product item.
2. UI запрашивает reason.
3. UI вызывает reverse endpoint для конкретного `orderItemId`.
4. После ответа заменить order state на response.

Не смешивать возврат с `PUT /orders/:id`.

## Ошибки И UX

| Error code                   | Когда бывает                                          | Что показать пользователю                                    |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `ORDER_CHANGED`              | заказ изменился после открытия формы                  | “Заказ изменился другим пользователем. Обновите данные.”     |
| `ORDER_ITEM_IMMUTABLE`       | фронт отправил read-only строку в `items`             | обновить заказ; если повторяется — баг UI mapping            |
| `ORDER_NOT_ACTIVE`           | заказ уже не `ACTIVE`                                 | закрыть editor, показать read-only режим                     |
| `ORDER_DUPLICATE_PRODUCT`    | один товар добавлен дважды в активные строки заказа   | подсветить дублирующий товар                                 |
| `ORDER_PRODUCT_NOT_SELLABLE` | товар недоступен к продаже в локации                  | попросить выбрать другой товар или обновить справочник       |
| `ORDER_SELLER_INVALID`       | sellerStaffId неактивен/не принадлежит нужной локации | сбросить продавца и попросить выбрать актуального сотрудника |

Для `ORDER_CHANGED` не делать auto-merge. Desired-state форма не знает намерений второго пользователя. Правильный UX: показать сообщение, перезагрузить order, дать пользователю повторить изменения.

## Сценарии

### 1. Дозаказ товара после завершённой услуги

1. Бронь завершилась.
2. В заказе есть `SERVICE/CONFIRMED`.
3. Клиент покупает товар.
4. UI открывает order-card, service rows показывает read-only.
5. UI добавляет товар через `POST /orders/:orderId/items` или через editor `PUT` с новой строкой без `id`.
6. Товар появляется как `PRODUCT/DRAFT`.
7. Кассир подтверждает товар отдельным confirm-flow.

### 2. Редактирование черновиков в частично подтверждённом заказе

1. В заказе есть `SERVICE/CONFIRMED` и `PRODUCT/DRAFT`.
2. UI показывает service read-only, product draft editable.
3. Пользователь меняет quantity или товар.
4. UI отправляет только editable draft rows + `version`.
5. Backend сохраняет diff по `OrderItem.id`, confirmed service не трогается.

### 3. Два менеджера открыли один заказ

1. A и B видят `version = 17`.
2. B сохраняет изменения, backend возвращает `version = 18`.
3. A пытается сохранить старую форму с `version = 17`.
4. Backend возвращает `ORDER_CHANGED`.
5. UI A показывает конфликт и предлагает обновить заказ.

### 4. Отмена будущей брони с draft-товарами

1. В бронь добавили товары, они лежат как `PRODUCT/DRAFT`.
2. Бронь отменили до завершения.
3. Backend удаляет эти draft-товары вместе с отменой.
4. UI после cancel не должен ожидать, что draft-товары остались в заказе.

Если клиент всё равно покупает товар после отмены услуги, это новая standalone-продажа через обычный `POST /orders`.

### 5. Отмена завершённой брони с проданным товаром

1. Бронь завершена, услуги `SERVICE/CONFIRMED`.
2. Товар уже подтверждён как `PRODUCT/CONFIRMED`.
3. Бронь отменяют.
4. Backend сторнирует услуги, товар остаётся проданным.
5. UI должен дать вход в order-card, где товар можно вернуть через reverse-flow.

## Ограничения

1. Нельзя редактировать service rows через order editor.
2. Нельзя удалять confirmed product через save формы.
3. Нельзя отправлять locked/read-only строки в `UpdateOrderRequest.items`.
4. Нельзя использовать `productId` как ключ React-list/form identity для существующих строк; использовать `OrderItem.id`.
5. Нельзя silently retry при `ORDER_CHANGED`; нужен явный refresh.
6. Batch add-items создаёт новые draft rows, но не заменяет весь draft-набор.
7. `PUT /orders/:id` заменяет именно editable draft-набор, а не весь заказ.

## Migration Plan Для Фронта

1. Обновить generated API types после нового OpenAPI.
2. Добавить `order.version` в store/form state.
3. Перестроить order editor на две коллекции: `readonlyItems` и `editableDraftProductItems`.
4. Перевести form identity с `productId` на `orderItem.id`.
5. На save отправлять только editable draft product rows.
6. Обработать `ORDER_CHANGED` как конфликт с обязательным refresh.
7. Заменить одиночное добавление товара в бронь на `POST /bookings/:id/items`.
8. Для order-card добавить read-only секцию confirmed/reversed/service rows.
9. Для `PRODUCT/CONFIRMED` подключить reverse action с reason.
10. После cancel/delete будущей брони не пытаться сохранять draft-товары локально.
11. Добавить regression-тесты UI на частично подтверждённый заказ, stale version и immutable rows.

## QA Checklist

1. Заказ с `SERVICE/CONFIRMED` открывается, draft product можно добавить.
2. `PRODUCT/CONFIRMED` виден read-only и не попадает в `PUT items`.
3. Удаление draft product из формы отправляет payload без этой строки.
4. Новая строка отправляется без `id`.
5. Существующая draft строка отправляется с `id`.
6. При `ORDER_CHANGED` форма не перетирает чужие изменения.
7. При отмене будущей брони draft-товары исчезают после refresh.
8. При отмене завершённой брони confirmed product остаётся в заказе.
9. Batch add в бронь возвращает `OrderResponse`, UI обновляет order state из ответа.
10. Totals всегда берутся из backend response.
