# Оплата визитов и продаж (план)

Статус: реализовано (ветка `feature/order-payments`, миграция `20261120120000_payments`). Отличия реализации от исходного дизайна отмечены в тексте и в разделе 11. Продолжение - [payment-tracking-plan.md](./payment-tracking-plan.md): учёт оплат филиала (`NOT_TRACKED`, запрет записи при `DISABLED`), оплата в один клик (`expectedAmount`, `expectNoPayment`) и отмена оплаты автором.

Задача: фиксировать, как клиент заплатил за визит или продажу товаров (наличные, карта, смешанно), возвращать деньги и показывать в календаре деньги за период, которые сверяются с кассой и терминалом.

Вне задачи: фискальные чеки, ККМ и интеграция с терминалом; кассовые смены, остаток на начало дня, внесения и изъятия; скидки в оплате; сертификаты и бонусы; онлайн-предоплата через виджет; переводы и QR; долги клиентов и частичная предоплата (см. открытые вопросы).

## 1. Модель

### 1.1 Домен и владение

Новый модуль `payments` владеет таблицами `PaymentOperation` и `Payment` (журнал денег). Модуль ничего не знает о записях и заказах: `orderId` для него - непрозрачная ссылка, валюту и сумму к оплате передаёт вызывающий. Контроллеров у модуля нет.

Направление зависимостей (без циклов):

```text
Bookings  -> Orders -> Payments
Bookings  -> Payments            (пакетное чтение итогов для карточек и календаря)
Dashboard -> Orders aggregates -> Bookings aggregates, Payments aggregates
```

- `PaymentsFacade` - запись, замена, аннулирование, возврат, чтение операций и итогов по заказам. Все методы записи принимают `tx` и требуют, чтобы вызывающий держал блокировку заказа.
- `PaymentsAggregatesService` - SQL-фрагменты и суммы для сводки (по образцу `BookingsAggregatesService`).
- Оркестрация визита (завершение + товары + оплата) живёт в Bookings, продажи и возвраты товаров - в Orders.
- Payments не может зависеть от Orders: Orders вызывает Payments внутри возврата товара (атомарный возврат денег), обратная зависимость дала бы цикл.

### 1.2 Таблицы

`PaymentOperation` - одно действие человека: "оплата" (одна или две записи) или "возврат денег". Группирует записи и хранит идемпотентность.

| Поле | Тип | Смысл |
| --- | --- | --- |
| `id` | uuid | |
| `locationId`, `orderId` | uuid | Филиал; заказ визита или продажи |
| `type` | `PaymentType` | `PAYMENT` или `REFUND` |
| `idempotencyKey` | varchar(100) | Уникален в филиале |
| `requestHash` | char(64) | SHA-256 намерения |
| `orderReturnId` | uuid?, unique | Возврат товара, частью которого является возврат денег |
| `replacesOperationId` | uuid? | Какую оплату заменила |
| `createdById`, `createdByName`, `createdAt` | | Кто и когда записал |

`Payment` - одно движение денег одним способом.

| Поле | Тип | Смысл |
| --- | --- | --- |
| `id`, `operationId`, `locationId`, `orderId` | uuid | |
| `type` | `PaymentType` | Копия типа операции для сумм без join |
| `method` | `PaymentMethod` | `CASH` или `CARD`; новое значение enum добавляется без изменения модели |
| `amount` | decimal(12,2) | Всегда > 0 (CHECK) |
| `currency` | varchar(3) | Валюта заказа |
| `occurredAt` | timestamp | Когда деньги перешли из рук в руки |
| `createdById`, `createdByName`, `createdAt` | | |
| `voidedAt`, `voidedById`, `voidedByName`, `voidReason` | | Аннулирование (исправление ошибки) |

Тип + положительная сумма, а не знак: смысл записи явный, CHECK `amount > 0` ловит ошибки знака, замена аннулирует только `PAYMENT` и не трогает возвраты, сводке не нужно разбирать знак. В расчётах возврат вычитается.

Частичный уникальный индекс `Payment(orderId, method) WHERE type = 'PAYMENT' AND voidedAt IS NULL` - не больше одной активной записи наличных и одной карты на заказ, то есть не больше одной активной оплаты.

### 1.3 Оплата, замена, возврат, аннулирование

- **Оплата** - операция `PAYMENT`: одна запись (наличные или карта) или две (смешанно). "Смешанно" не хранится, это две записи одной операции.
- **Изменить оплату** - новая операция `PAYMENT` заменяет активную: старые записи аннулируются (кто, когда, причина "Замена оплаты"), новые создаются в той же транзакции, `replacesOperationId` связывает их. Это исправление ошибки записи, оно переписывает день исходной оплаты.
- **Вернуть деньги** - операция `REFUND` с одной записью: способ, сумма, дата (по умолчанию сейчас). Новое движение денег; день исходной оплаты не меняется. Для отменённого или пропущенного оплаченного визита, для снижения цены после сверки дня, для возврата товара.
- **Аннулировать операцию** - исправление без замены ("оплата указана по ошибке", "возврат проведён по ошибке"). Возврат денег, связанный с `OrderReturn`, отдельно не аннулируется: товар и деньги вернулись вместе.

Доплаты (вторая оплата к существующей) нет: каждая запись оплаты заменяет предыдущую.

### 1.4 Сумма к оплате

Состояние оплаты не хранится, оно выводится из суммы к оплате (`due`) и активных записей.

Продажа (заказ без записи):

```text
due = productsNet, если заказ ACTIVE, иначе 0
productsNet = сумма lineTotal позиций PRODUCT/CONFIRMED - сумма POSTED возвратов по ним
```

Визит:

```text
due = servicesDue + productsNet (заказа визита, 0 если заказа нет)
servicesDue = сумма (customPrice ?? chargedPrice) услуг записи,
              если запись не удалена и статус PENDING, CONFIRMED или COMPLETED; иначе 0
```

- Оплата возможна до завершения (мастер закончил раньше, клиент заплатил заранее): услуги ещё не проведены в заказе, поэтому берутся из записи. После завершения услуги заказа совпадают с услугами записи (их синхронизирует `syncCompletedBooking`), формула одна.
- Черновые товары не входят: они не проданы. Чтобы оплатить их вместе с визитом, их проводят в той же операции (`confirmProductItemIds`).
- `NO_SHOW` и `CANCELLED`: услуги не к оплате, остаются только проданные товары.
- Возврат товара уменьшает `due`, возврат денег в той же операции уменьшает `paid`, поэтому оплаченный заказ остаётся `PAID`.

Формула визита считается в Bookings (`rules/visit-payment-due.rules.ts`), `productsNet` отдаёт `OrdersFacade.productTotals(orderIds)`. Orders сам считает `due` только для продаж.

### 1.5 Производное состояние

```text
paid = сумма активных PAYMENT - сумма активных REFUND
```

| Статус | Условие | Текст в UI |
| --- | --- | --- |
| `NOT_REQUIRED` | Активных записей нет, `due = 0` | |
| `NOT_SPECIFIED` | Активных записей нет, `due > 0`, учёт оплат филиала охватывает визит (по `startAt`) или продажу (по `occurredAt`) | Оплата не указана |
| `NOT_TRACKED` | Активных записей нет, `due > 0`, учёт выключен или визит/продажа раньше `Location.paymentTrackingSince` ([payment-tracking-plan.md](./payment-tracking-plan.md)) | |
| `PAID` | Записи есть, `paid = due` | |
| `UNDERPAID` | Записи есть, `paid < due` | Недоплата |
| `OVERPAID` | Записи есть, `paid > due` | Переплата |

Ничего не меняется автоматически. Изменение цены, проведённый позже товар, отмена или неявка оплаченного визита дают `UNDERPAID` или `OVERPAID`. Человек решает: "Изменить оплату" (ошибка записи) или "Вернуть деньги" (деньги действительно вернули). Крон, смена статуса и создание записи никогда не создают оплату и не подставляют способ.

### 1.6 Сумма записи

- Наличные или карта: сумма не передаётся, сохраняется снимок `due` на момент операции. Журналу нужна сумма; при последующем изменении цены запись не меняется, меняется только статус.
- Смешанно: передаются обе части, каждая > 0, `cash + card = due`. Сервер считает `due` сам под блокировкой и при расхождении отвечает 409 `PAYMENT_AMOUNT_MISMATCH` с `responseValue: { amountDue }`.
- `due = 0` -> 409 `PAYMENT_NOTHING_DUE`.
- Оплата больше суммы (чаевые) не поддерживается.

Фронтенд считает `due` для окна записи как сумму цен услуг и проводимых товаров (шкала 2, без округления) и при расхождении получает 409 с актуальной суммой.

### 1.7 Дата движения денег

`Payment.occurredAt` - момент, когда деньги перешли из рук в руки. Сводка считает деньги по нему.

| Операция | По умолчанию |
| --- | --- |
| Оплата визита | Визит начинается сегодня или позже (день филиала) - сейчас; визит был в прошлый день - `Booking.startAt` |
| Оплата продажи | Продажа в прошлый день - `Order.occurredAt`; иначе сейчас |
| Замена оплаты | `occurredAt` заменяемой операции |
| Возврат денег | Сейчас; при возврате товара - дата возврата |

Явная дата: поле `occurredAt` - местное время филиала без смещения (`IsLocalDateTime`, как `startAt` записи). Проверки: не позже текущего момента + 5 минут, не раньше чем 366 дней назад (400 `PAYMENT_DATE_INVALID`). Фронтенд показывает "Дату оплаты" только для визита не сегодня.

### 1.8 Идемпотентность

Журнал аддитивный, поэтому каждая операция записи принимает `idempotencyKey`:

1. Advisory-блокировка ключа (`pg_advisory_xact_lock`, как `lockSaleRequest`) до любых чтений.
2. Есть операция с ключом и тем же `requestHash` - вернуть её результат без эффектов (завершения, проведения, аудита).
3. Тот же ключ, другой hash - 409 `PAYMENT_IDEMPOTENCY_CONFLICT` с `{ operationId }`.
4. Иначе выполнить; ключ и hash коммитятся вместе с эффектами, откат освобождает ключ.

Hash: тип, заказ или запись, способ, части, явная дата, ID проводимых товаров, сумма и способ возврата. `due` в hash не входит.

Вложенная оплата в операции, у которой уже есть ключ (немедленная продажа, проведение товаров, возврат товара), использует ключ родителя с префиксом (`order-sale:<key>`, `order-confirm:<key>`, `order-return:<key>`); оплата входит в hash родителя. Аннулирование идемпотентно по состоянию, ключ не нужен. Ключи клиента с этими префиксами отклоняются валидацией (400), чтобы не совпасть с вложенными.

Ограничения идемпотентности правки записи (`PUT .../bookings/:id` с `payment`):

- Повтор с тем же ключом и запросом пропускает шаг оплаты (и проведение товаров), но саму правку записи применяет снова: правка записи своего ключа не имеет.
- `confirmProductItemIds` без `payment` не имеет идемпотентности: повтор после успешного проведения отвечает 409 `ORDER_ITEM_NOT_DRAFT`.

Побочный эффект: ручное создание записи с оплатой больше не дублируется при повторе - второй запрос получает 409 по ключу оплаты, транзакция откатывается.

### 1.9 Блокировки

Порядок везде одинаковый: ключ идемпотентности (advisory) -> запись (`FOR UPDATE`, если операция её затрагивает) -> заказ (`FOR UPDATE`) -> записи журнала. `due` и `paid` считаются внутри блокировки. Замена - аннулирование и вставка в одной транзакции. Эндпоинты заказа визита (возврат денег, аннулирование операции, возврат товара) сначала берут запись `FOR SHARE` (`BookingVisitsService.lockForOrder`), потом заказ: так удаление записи и правка цен не пересекаются с ними, а порядок запись -> заказ сохраняется.

Сводка читает свои запросы в одной транзакции `REPEATABLE READ`, чтобы деньги и список "не указана" были согласованы.

### 1.10 Права

| Действие | Право |
| --- | --- |
| Первая оплата визита (в том числе с завершением) | Как завершение: `booking:write` или `booking.own:write` для своего визита |
| Замена активной оплаты визита | Дополнительно `order:write` |
| `confirmProductItemIds`, `confirmProducts` | Дополнительно `order:write` |
| Оплата продажи, замена, аннулирование операции, возврат денег | `order:write` |
| Возврат товара вместе с возвратом денег | `order.return:write` |
| Сводка | `analytics.location:read` |

Новых claim нет. Мастер записывает оплату своего визита, но не меняет её. Повтор с тем же ключом возвращает результат до проверки права на замену, поэтому повтор мастера не получает 403.

### 1.11 Зарплата

Способ и факт оплаты не влияют на начисления: комиссия считается от проведённых позиций при завершении и продаже. Изменений в Payroll нет.

## 2. Сценарии визита

`visitStarted` = `Booking.startAt <= now`.

| Статус до | Оплата визита | Эффект |
| --- | --- | --- |
| PENDING или CONFIRMED, визит начался | Да | Завершается в той же транзакции (статус, синхронизация услуг, начисления), проводятся выбранные товары, затем оплата |
| PENDING или CONFIRMED, визит не начался | Да | Только оплата (предоплата), статус не меняется; товары можно провести |
| COMPLETED | Да | Проводятся выбранные товары, оплата заменяет активную |
| NO_SHOW, CANCELLED | Только при `due > 0` (уже проданные товары) | Статус не меняется; `confirmProductItemIds` запрещён (409 `BOOKING_PAYMENT_NOT_ALLOWED`) |
| Удалённая запись | Нет | 404 |

Одно правило для всех точек входа (`PUT .../payment`, ручное создание, `PUT` записи): оплата начавшегося PENDING или CONFIRMED визита завершает его. Окно записи может само переключать статус, но сервер ведёт себя так же без этого.

Порядок в транзакции: ключ -> блокировка записи -> создание или правка записи -> завершение при необходимости -> `ensureBookingOrder` (заказ визита создаётся, если его нет) -> блокировка заказа -> проведение товаров -> расчёт `due` -> запись или замена оплаты -> commit -> аудит и уведомления. Любая ошибка откатывает всё.

## 3. API

### 3.1 Общие DTO

`PaymentInputDto`:

```json
{
  "method": "MIXED",
  "cashAmount": "1000.00",
  "cardAmount": "2000.00",
  "occurredAt": "2026-11-19T18:30:00",
  "idempotencyKey": "6c0f..."
}
```

| Поле | Правило |
| --- | --- |
| `method` | `CASH` \| `CARD` \| `MIXED` (входной enum `PaymentInputMethod`; `MIXED` создаёт две записи) |
| `cashAmount`, `cardAmount` | Только при `MIXED`, оба обязательны, `IsPrice`, каждое > 0. Иначе 400 `PAYMENT_SPLIT_INVALID` |
| `occurredAt` | Необязательно, местное время филиала, см. 1.7 |
| `idempotencyKey` | Обязательно, до 100 символов. Во вложенных оплатах с ключом родителя отсутствует |

`PaymentSummaryDto` (чтение):

```json
{
  "status": "PAID",
  "amountDue": "3000.00",
  "paidAmount": "3000.00",
  "cashAmount": "1000.00",
  "cardAmount": "2000.00",
  "payment": {
    "operationId": "uuid",
    "occurredAt": "2026-11-19T15:30:00.000Z",
    "createdByName": "Анна Петрова",
    "createdAt": "2026-11-20T09:12:00.000Z",
    "parts": [
      { "method": "CASH", "amount": "1000.00" },
      { "method": "CARD", "amount": "2000.00" }
    ]
  },
  "refunds": [
    {
      "operationId": "uuid",
      "occurredAt": "2026-11-20T10:00:00.000Z",
      "createdByName": "Анна Петрова",
      "createdAt": "2026-11-20T10:00:00.000Z",
      "orderReturnId": null,
      "parts": [{ "method": "CARD", "amount": "500.00" }]
    }
  ]
}
```

`cashAmount` и `cardAmount` - нетто по способу (оплата минус возвраты). `payment` - активная оплата или `null`; из `parts` фронтенд строит "Карта · 1 500 ₽" или "Наличные 1 000 + Карта 2 000". Историю замен и аннулирований показывает аудит.

### 3.2 Визит (Bookings)

**`PUT /locations/:locationId/bookings/:id/payment`** - оплатить визит.

- Тело: `PaymentInputDto` + `confirmProductItemIds?: uuid[]` (уникальные PRODUCT/DRAFT позиции заказа визита).
- Ответ: `BaseResponseDto<{ id, orderId, operationId }>`.
- Права: 1.10.
- Ошибки:
  - 404 - запись не найдена.
  - 409 `PAYMENT_AMOUNT_MISMATCH` (`amountDue`), 409 `PAYMENT_NOTHING_DUE`, 409 `PAYMENT_IDEMPOTENCY_CONFLICT`, 409 `BOOKING_PAYMENT_NOT_ALLOWED`.
  - 400 `PAYMENT_SPLIT_INVALID`, 400 `PAYMENT_DATE_INVALID`.
  - Проведение товаров: `ORDER_ITEM_NOT_FOUND`, `ORDER_ITEM_NOT_DRAFT`, `ORDER_PRODUCT_NOT_SELLABLE`, `ORDER_SELLER_INVALID`.
  - Ошибки завершения - как у `PATCH status`.

**`POST /locations/:locationId/bookings/manual`** - новые поля:

- `payment?: PaymentInputDto` - правила раздела 2 после вычисления итогового статуса. Начавшийся визит со статусом PENDING или CONFIRMED (явным или по умолчанию) завершается. С `NO_SHOW` без проданных товаров - 409 `PAYMENT_NOTHING_DUE`.
- `confirmProducts?: boolean` - провести все `products` в той же транзакции; требует `order:write`.

**`PUT /locations/:locationId/bookings/:id`** - новые поля `payment?: PaymentInputDto` и `confirmProductItemIds?`. Применяются после правки в той же транзакции по тем же правилам.

**`PATCH /locations/:locationId/bookings/:id/status`** - без изменений, оплату не принимает. Завершение без оплаты допустимо (крон, кнопка "Завершить"); для "Завершить и оплатить" фронтенд использует `PUT .../payment`.

**`DELETE /locations/:locationId/bookings/:id`** - 409 `BOOKING_HAS_PAYMENTS`, если `paid > 0`: удаление - исправление ошибки, сначала аннулировать оплату или вернуть деньги.

Отмена и неявка оплаченного визита разрешены и журнал не меняют (статус станет `OVERPAID`).

### 3.3 Заказы (Orders)

| Эндпоинт | Что делает |
| --- | --- |
| `PUT /locations/:locationId/orders/:orderId/payment` | Новый. Оплата или замена оплаты продажи. Тело `PaymentInputDto`. Ответ `{ id, operationId }`. Право `order:write`. Для заказа визита - 409 `ORDER_PAYMENT_VIA_BOOKING`: его `due` зависит от записи |
| `POST /locations/:locationId/orders/:orderId/refunds` | Новый. Тело `{ method: CASH \| CARD, amount, occurredAt?, reason, idempotencyKey }`. `amount` > 0 и не больше `paid` (409 `PAYMENT_REFUND_EXCEEDS_PAID` с `{ paidAmount }`). Работает и для заказов визитов. Право `order:write`. Ответ `{ id, operationId }` |
| `POST /locations/:locationId/orders/:orderId/payment-operations/:operationId/void` | Новый. Тело `{ reason }`. Аннулирует все записи операции; повтор - no-op. 404 `PAYMENT_OPERATION_NOT_FOUND`; 409 `PAYMENT_OPERATION_LINKED_TO_RETURN`. Право `order:write`. Ответ `{ id }` |
| `POST /locations/:locationId/orders` | `payment?` (без своего ключа) только с `confirmImmediately: true` (иначе 400). Ключ - ключ продажи; оплата входит в `saleRequestHash` |
| `POST /locations/:locationId/orders/:orderId/items/confirm` | `payment?` (без своего ключа) только для продажи; для визита - 409 `ORDER_PAYMENT_VIA_BOOKING`. Входит в hash операции |
| `POST /locations/:locationId/orders/:orderId/returns` | `refund?: { method }`. При `paid > 0` обязателен (400 `ORDER_RETURN_REFUND_REQUIRED`): сумма = `min(сумма возврата, paid)`, дата = дата возврата, операция связана с `OrderReturn`. При `paid = 0` запрещён. Одна транзакция |
| `PATCH /locations/:locationId/orders/:orderId/status` (аннулирование) | 409 `ORDER_HAS_PAYMENTS` при `paid > 0`: сначала аннулировать оплату (ошибка) или вернуть деньги |
| `PATCH .../items/:orderItemId/confirm` | Удаляется (фронтенд не использует) |
| `PATCH .../items/:orderItemId/reverse` | Удаляется (фронтенд не использует; полный возврат - обычный возврат остатка, теперь с возвратом денег) |

### 3.4 Чтение

- `BookingDetailsResponseDto.payment: BookingPaymentDto` = `{ orderId: uuid | null, ...PaymentSummaryDto }`. Для записи без заказа: `orderId: null`, `due` по услугам. Отсюда читают поповер календаря и страница записи. Только карточка, не список записей.
- `OrderResponseDto.payment: PaymentSummaryDto`. Для заказа визита `amountDue` считается по заказу (проведённые услуги + `productsNet`) и до завершения визита может отличаться от карточки записи; авторитетная сумма визита - в записи.
- `CalendarEventItemDto.paymentStatus: PaymentStatus | null` для карточек записей, `null` для блоков. Считается пакетно по записям окна (`servicesDue` из позиций, `productsNet` и `paid` пакетными запросами). Фронтенд ставит метку "Оплата не указана" только на прошедшие или завершённые визиты.
- Фильтров оплаты и колонки в списках нет. Публичные клиентские DTO не меняются.

### 3.5 Сводка в календаре

**`GET /locations/:locationId/dashboard/finance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`**

- Дни включительно, часовой пояс филиала, `TimeUtils.zonedDaysRange`. `from <= to`, не больше 62 дней (400 `FINANCE_SUMMARY_RANGE_TOO_LONG`).
- Право L: `analytics.location:read`.
- Фильтра по сотрудникам нет: касса и терминал общие на филиал.

```json
{
  "from": "2026-11-20",
  "to": "2026-11-20",
  "currency": "BYN",
  "timezone": "Europe/Minsk",
  "money": { "cash": "1500.00", "card": "3900.00", "total": "5400.00" },
  "refunds": { "cash": "0.00", "card": "300.00" },
  "notSpecified": {
    "amount": "800.00",
    "count": 2,
    "items": [
      {
        "kind": "VISIT",
        "orderId": "uuid",
        "bookingId": "uuid",
        "at": "2026-11-20T07:00:00.000Z",
        "clientName": "Ольга Ли",
        "staffNames": ["Анна Петрова"],
        "amountDue": "500.00"
      }
    ]
  }
}
```

| Поле | Определение |
| --- | --- |
| `money` | Нетто по способам: активные `PAYMENT` минус активные `REFUND`, у которых `Payment.occurredAt` в периоде. Аннулированные не входят |
| `refunds` | Активные `REFUND` с `occurredAt` в периоде по способам. Уже вычтены из `money`; фронтенд показывает, только если не ноль |
| `notSpecified` | Заказы без активных записей журнала и с `due > 0`, у которых день визита или продажи в периоде. `items` - до 20, по возрастанию `at`; `count` - всего; `amount` - сумма `due` всех |

`notSpecified` включает:

- **Визиты**: запись закрыта (`COMPLETED`, `NO_SHOW` или `CANCELLED`, в том числе удалённая), день - `Booking.startAt`, `due` по формуле 1.4. Активные записи (PENDING, CONFIRMED) не входят: их завершит крон или администратор.
- **Продажи**: заказ без записи, `ACTIVE`, `productsNet > 0`; день - `Order.occurredAt`. `staffNames` - продавцы.

Деньги считаются по дню движения денег, список "не указана" - по дню визита или продажи. Предоплата, внесённая вчера за сегодняшний визит, - во вчерашних деньгах; визит без записей журнала стоит в своём дне. `UNDERPAID` и `OVERPAID` в список не входят (вопрос 3).

Реализация: `FinanceSummaryService` (Dashboard) -> `PaymentsAggregatesService.moneyTotals(range)` (индекс `Payment(locationId, occurredAt)`) и `OrdersAggregatesService.notSpecified(range)`. Последний - один запрос с SQL-фрагментами `BookingsAggregatesService` (услуги, статус, мастера) и `PaymentsAggregatesService` (`NOT EXISTS` активных записей), по существующему образцу. Сырые запросы используют `::timestamptz AT TIME ZONE 'UTC'` и `activeLocationSql`.

### 3.6 Коды ошибок (новые)

| Код | HTTP | Когда |
| --- | --- | --- |
| `PAYMENT_AMOUNT_MISMATCH` | 409 | Части `MIXED` не равны `due`; `{ amountDue }` |
| `PAYMENT_SPLIT_INVALID` | 400 | `MIXED` без двух положительных частей или части при `CASH`/`CARD` |
| `PAYMENT_NOTHING_DUE` | 409 | `due = 0` |
| `PAYMENT_DATE_INVALID` | 400 | Дата в будущем или старше 366 дней |
| `PAYMENT_IDEMPOTENCY_CONFLICT` | 409 | Ключ с другим намерением; `{ operationId }` |
| `PAYMENT_REFUND_EXCEEDS_PAID` | 409 | Возврат больше оплаченного; `{ paidAmount }` |
| `PAYMENT_OPERATION_NOT_FOUND` | 404 | Операции нет в этом заказе |
| `PAYMENT_OPERATION_LINKED_TO_RETURN` | 409 | Аннулирование возврата денег, связанного с возвратом товара |
| `ORDER_PAYMENT_VIA_BOOKING` | 409 | Оплата заказа визита через эндпоинт заказа |
| `ORDER_HAS_PAYMENTS` | 409 | Аннулирование продажи при `paid > 0` |
| `ORDER_RETURN_REFUND_REQUIRED` | 400 | Возврат товара, при котором возвращаются деньги, без `refund` |
| `BOOKING_HAS_PAYMENTS` | 409 | Удаление записи при `paid > 0` |
| `BOOKING_PAYMENT_NOT_ALLOWED` | 409 | Оплата или проведение товаров, недопустимые для статуса записи |
| `FINANCE_SUMMARY_RANGE_TOO_LONG` | 400 | Период сводки больше 62 дней |

## 4. Аудит

Новые `AuditEvent` с entity `ORDER` и `entityId = orderId`, чтобы события попадали в историю заказа:

- `PAYMENT_RECORDED` - первая оплата.
- `PAYMENT_REPLACED` - замена; payload содержит старую и новую операцию.
- `PAYMENT_VOIDED` - аннулирование операции, с причиной.
- `PAYMENT_REFUNDED` - возврат денег, с `orderReturnId`, если есть.

Payload: `operationId`, `bookingId`, `parts`, `occurredAt`, `amountDue`, `currency`, `reason`. `PaymentsFacade` возвращает описание изменения, оркестратор публикует аудит после commit. Завершение через оплату дополнительно пишет обычный `BOOKING_STATUS_CHANGED`.

## 5. Крайние случаи

| Случай | Поведение |
| --- | --- |
| Оплата начавшегося визита без заказа | Заказ создаётся в той же транзакции, услуги синхронизируются при завершении |
| Предоплата будущего визита | Запись `PAYMENT` с датой "сейчас", статус визита не меняется |
| Визит затем завершён (крон или вручную) без новой оплаты | Журнал не меняется; `PAID`, если сумма та же |
| Крон завершает визит без оплаты | `NOT_SPECIFIED`, визит в списке сводки за свой день |
| Изменилась цена оплаченного визита | `UNDERPAID` или `OVERPAID`; человек меняет оплату или возвращает деньги |
| Товар проведён позже на оплаченном визите | `UNDERPAID`; "Изменить оплату" на смешанную |
| Предоплата вчера картой, сегодня товар наличными | Замена переносит всю оплату на дату исходной операции или на явную дату; доплаты нет (вопрос 2) |
| Отмена или неявка оплаченного визита | Услуги выпадают из `due` -> `OVERPAID`; "Вернуть деньги" |
| Возврат товара оплаченного заказа | Атомарно: возврат товара и денег; статус остаётся `PAID` |
| Возврат товара неоплаченного или недоплаченного заказа | Возвращается только переплата: `max(0, paid - due после возврата)`, не больше суммы возврата. Деньги, которые не получали, не возвращаются; присланный `refund` при нулевой сумме игнорируется |
| Возврат денег другим способом | Не больше, чем этот способ принёс за вычетом его возвратов (409 `PAYMENT_REFUND_EXCEEDS_PAID` с `{ paidAmount, method }`) |
| Аннулирование возврата денег удалённой записи | 409 `BOOKING_PAYMENT_NOT_ALLOWED`: деньги не возвращаются на удалённый визит |
| Аннулирование оплаченной продажи | 409; сначала аннулировать оплату или вернуть деньги |
| Удаление оплаченной записи | 409 `BOOKING_HAS_PAYMENTS` |
| Перенос оплаченного визита на другой день | Деньги остаются в дне оплаты |
| Повтор запроса с тем же ключом | Тот же результат без повторного завершения, проведения и аудита |
| Тот же ключ, другая оплата | 409 `PAYMENT_IDEMPOTENCY_CONFLICT` |
| Двое меняют оплату одновременно | Сериализуются блокировкой заказа; смешанная оплата по устаревшей сумме -> 409 с `amountDue` |
| Ошибка проведения товара в оплате визита | Откат всего: статус, товары, оплата |
| Визит через полночь | День визита - день `startAt` |
| Повтор ручного создания с оплатой | 409 по ключу оплаты, вторая запись не создаётся |
| Данные stage | Записей журнала нет: закрытые визиты и продажи - "Оплата не указана" |

## 6. Миграция

Одна миграция `YYYYMMDDHHMMSS_payments`:

1. Enum `PaymentMethod (CASH, CARD)`, `PaymentType (PAYMENT, REFUND)`.
2. `PaymentOperation`: unique `(locationId, idempotencyKey)`, unique `orderReturnId`, индекс `(orderId)`. FK: `locationId -> Location`, `orderId -> Order`, `orderReturnId -> OrderReturn`, `replacesOperationId -> PaymentOperation` (все Restrict).
3. `Payment`: CHECK `amount > 0`; индексы `(locationId, occurredAt)`, `(orderId)`, `(operationId)`; частичный unique `(orderId, method) WHERE type = 'PAYMENT' AND "voidedAt" IS NULL` (raw SQL). FK: `operationId` (Cascade), `locationId`, `orderId` (Restrict).
4. `AuditEvent`: `PAYMENT_RECORDED`, `PAYMENT_REPLACED`, `PAYMENT_VOIDED`, `PAYMENT_REFUNDED`.
5. Backfill нет.

Перенос `Order.occurredAt` заказа визита на `Booking.startAt` из прошлого плана не нужен: день визита берётся из записи, деньги - из `Payment.occurredAt`.

## 7. Тесты

Unit:

- `visit-payment-due.rules.spec.ts`: статусы записи, удалённая запись, черновики, возвраты.
- `payment-state.rules.spec.ts`: пять статусов, нетто по способам.
- Дата по умолчанию: визит сегодня, в прошлом, в будущем; продажа; замена; границы дня в поясе филиала.
- Hash операций: изменение каждого поля даёт другой hash, `due` не влияет.

Интеграция (БД):

- `PUT bookings/:id/payment`: начавшийся CONFIRMED -> COMPLETED + начисления + оплата; не начавшийся -> только оплата; COMPLETED -> замена (аннулирование + вставка, `replacesOperationId`); NO_SHOW с товаром и без; `confirmProductItemIds` и откат при ошибке товара.
- `MIXED`: несовпадение -> 409 с `amountDue`; части <= 0; одиночный способ хранит снимок `due`.
- Идемпотентность: повтор без эффектов и аудита; другой hash -> 409; параллельные запросы с одним ключом.
- Ручное создание с `payment` и `confirmProducts`: явный COMPLETED, произвольное время, CONFIRMED в прошлом -> COMPLETED; повтор -> 409 и откат.
- `PUT` записи с оплатой.
- Продажа `confirmImmediately` с оплатой; `items/confirm` с оплатой; эндпоинт заказа для визита -> 409.
- Возврат денег: лимит `paid`, дата по умолчанию. Возврат товара с `refund` атомарен; без `refund` при `paid > 0` -> 400.
- Аннулирование операции; связанный с возвратом товара -> 409; повтор - no-op.
- Аннулирование продажи и удаление записи при `paid > 0` -> 409.
- Изменение цены и товары после оплаты дают `UNDERPAID`/`OVERPAID` без изменений журнала.
- Крон не создаёт записей журнала.
- Частичный unique-индекс не допускает двух активных оплат одним способом.

Сводка:

- Деньги по `occurredAt` на границах дня (23:30 и 00:30 местного времени).
- Замена переписывает день исходной оплаты; возврат попадает в свой день; аннулированные не считаются.
- `notSpecified`: закрытые визиты по `startAt`, продажи по `occurredAt`, активные визиты исключены, лимит 20 и `count`.
- Период больше 62 дней -> 400.

Права:

- Мастер записывает первую оплату своего визита; замена -> 403; повтор того же ключа -> 200.
- Без `order:write`: оплата продажи, возврат денег, аннулирование -> 403.
- Сводка без `analytics.location:read` -> 403.

DTO: `payment` в карточке записи (с заказом и без), в заказе; `paymentStatus` в календаре.

## 8. Файлы

Схема и общие:

- `src/database/schema.prisma`, новая миграция.
- `src/shared/validation/error-codes.enum.ts`.
- `src/modules/audit/enums/audit-event.enum.ts`.

Payments (новый модуль `src/modules/payments`):

- `payments.module.ts`, `payments.facade.ts`.
- `services/payment-ledger.service.ts` (запись, замена, аннулирование, возврат, идемпотентность), `services/payment-read.service.ts` (операции и итоги по заказам, пакетно).
- `aggregates/payments-aggregates.module.ts`, `aggregates/services/payments-aggregates.service.ts`.
- `rules/payment-state.rules.ts`, `rules/payment-request-hash.ts`, `rules/payment-occurred-at.rules.ts` + spec.
- `enums/payment-method.enum.ts`, `enums/payment-type.enum.ts`, `enums/payment-input-method.enum.ts`, `enums/payment-status.enum.ts`.
- `dto/payment-input.dto.ts`, `dto/payment-summary.dto.ts`, `dto/payment-operation.dto.ts`, `dto/payment-part.dto.ts`, `dto/refund-input.dto.ts`, `dto/void-payment-operation.dto.ts`.
- `interfaces/payment-command.interface.ts`, `interfaces/payment-change.interface.ts`, `interfaces/order-payment-totals.interface.ts`, `interfaces/payment-money-totals.interface.ts`.

Orders:

- `orders.facade.ts`: `ensureBookingOrder`, `confirmProductItemsForBooking`, `productTotals`, оплата и возврат денег, чтение сводки оплаты.
- `controllers/orders.controller.ts`: `PUT payment`, `POST refunds`, `POST payment-operations/:id/void`; удалить 2 маршрута.
- `services/order-creation.service.ts`, `services/order-product-transition.service.ts` (оплата при проведении, запрет аннулирования, удаление одиночного проведения и reverse), `services/order-return.service.ts` (возврат денег), `services/order-booking-sync.service.ts`, `rules/sale-request-hash.ts`.
- DTO: `create-order.dto.ts`, `confirm-order-items.dto.ts`, `create-order-return.dto.ts`, новый `order-return-refund.dto.ts`, `order-response.dto.ts`; удалить `reverse-order-item.dto.ts`.
- `aggregates/services/orders-aggregates.service.ts` + интерфейсы `not-specified-row`, `finance-range`.
- `orders.module.ts` (импорт `PaymentsModule`).

Bookings:

- `controllers/bookings.controller.ts`: `PUT :id/payment`, проверки прав, `payment` в карточке.
- Новый `services/write/booking-payment.service.ts` (оркестрация раздела 2), `rules/visit-payment-due.rules.ts`.
- `services/write/booking-lifecycle.service.ts` (завершение как шаг внутри чужой транзакции, запрет удаления), `services/write/booking-mutation.service.ts`, `booking-create.facade.ts`, `services/booking-reservation.service.ts`.
- DTO: `pay-booking.dto.ts`, `booking-payment.dto.ts`, `manual-create-booking.dto.ts`, `update-booking.dto.ts`, `booking-details-response.dto.ts`.
- `services/read/booking-calendar-read.service.ts`, `aggregates/services/bookings-aggregates.service.ts` (фрагменты для списка "не указана").
- `bookings.module.ts` (импорт `PaymentsModule`).

Calendar:

- `dto/calendar-event-item.dto.ts`, `interfaces/calendar-booking-view.interface.ts`.

Dashboard:

- `controllers/dashboard.controller.ts`, `services/finance-summary.service.ts`, `dashboard.module.ts`.
- DTO: `finance-summary-request.dto.ts`, `finance-summary-response.dto.ts`, `finance-money.dto.ts`, `finance-refunds.dto.ts`, `finance-not-specified.dto.ts`, `finance-not-specified-item.dto.ts`.
- Enum `finance-not-specified-kind.enum.ts`.

Документация:

- `docs/orders.md`, `docs/architecture/booking-write-flows.md`, `docs/architecture/domain-ownership.md` (владелец `Payment`, `PaymentOperation`), `docs/architecture/rbac-permissions-map.md`.
- `docs/frontend-permissions.json` (описание `booking.own:write`: запись оплаты своего визита) и зеркало `crm-frontend/docs/frontend-permissions.json`.

## 9. Отклонённые варианты

- Колонки оплаты на `Order` (прошлый план): переписывают прошлые дни при любом изменении суммы и требуют автоматических правил пересчёта.
- Знаковая сумма вместо типа: ошибки знака не ловятся ограничением, замене нужно отличать возвраты.
- Хранимый статус оплаты: расходится с суммой заказа при каждом изменении цены.
- Автоматическая подстановка способа (крон, смена статуса): ломает сверку с терминалом.
- Оплата через `PATCH status`: смешивает два независимых действия.
- Payments зависит от Orders: цикл с атомарным возвратом товара и денег.
- Деньги по дню визита (как в YCLIENTS): касса сверяется по дню движения денег.

## 10. Открытые вопросы

1. Частичная предоплата (депозит 1 000 из 3 000)? По умолчанию: нет в v1, сумма всегда равна `due`. При необходимости - необязательный `amount` для одного способа (статус `UNDERPAID`).
2. Доплата без замены (вчера предоплата картой, сегодня товар наличными)? По умолчанию: нет, только замена с явной датой.
3. Показывать в списке сводки `UNDERPAID` и `OVERPAID` закрытых визитов? По умолчанию: нет, только `NOT_SPECIFIED`; статус виден на карточке.
4. Запрет удаления оплаченной записи и аннулирования оплаченной продажи (409)? По умолчанию: да.
5. Граница даты оплаты: не старше 366 дней, допуск 5 минут в будущее? По умолчанию: да.
6. Возврат товара неоплаченного заказа без возврата денег? Решено: деньги возвращаются только при переплате после возврата; `refund` при нулевой сумме игнорируется, отдельной ошибки нет.
7. `OrderResponseDto.payment.amountDue` для незавершённого визита без услуг (Orders не знает статус записи)? По умолчанию: да, авторитетная сумма визита - в карточке записи.
8. Удалить неиспользуемые `PATCH items/:id/confirm` и `PATCH items/:id/reverse`? По умолчанию: да.

## 11. Отличия реализации

- Сумма оплаты покрывает `due` плюс активные возвраты (`requiredAmount` в 409 `PAYMENT_AMOUNT_MISMATCH`); без возвратов это `due`.
- `PAYMENT_VOID_HAS_REFUNDS` (409): нельзя аннулировать оплату при активных возвратах.
- Возврат денег при возврате товара - только переплата после возврата (см. раздел 5). Для заказа визита `due` после возврата = услуги записи + проданные товары; факты визита Orders получает из `BookingVisitsModule` (нижний модуль Bookings без зависимостей, его уже использует Reviews), поэтому цикла Orders -> Bookings нет.
- Возврат денег ограничен по способу: не больше нетто этого способа и не больше `paid`.
- Дата возврата денег при возврате товара проверяется теми же границами, что дата оплаты (400 `PAYMENT_DATE_INVALID`).
- Удаление заказа запрещено при любых записях журнала (FK Restrict), `idempotencyKey` операции - varchar(120), у операции есть `reason`.
- Оплата визита повторно проверяет участие мастера на заблокированной записи.
- Аудит добавленных к записи черновых товаров (`ORDER_UPDATED`) публикуется после commit.
