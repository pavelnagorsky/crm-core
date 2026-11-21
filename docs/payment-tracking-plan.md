# Оплата в один клик и учёт оплат филиала (план)

Статус: бэкенд реализован (миграция `20261121120000_payment_tracking`), отличия - в разделе 11. Продолжение `docs/payments-plan.md` (журнал оплат реализован на master, миграция `20261120120000_payments`).

Бэкенд (`crm-core`) и фронтенд (`crm-frontend`) делаются параллельно строго по этому документу. Контракт в разделе 3 точный: имена полей, enum, коды ошибок, права. Любое отклонение - сначала правка этого документа.

## 0. Проблема и цель

После запуска оплат каждый закрытый визит показывает «Оплата не указана» (истории оплат нет), а запись оплаты стоит окна на каждый визит. В YCLIENTS оплату тоже отмечают вручную, но на кассе это один клик: в окне визита «Пришёл», затем «Наличные» или «Карта».

Цель: отметить оплату быстрее, чем в YCLIENTS, и не показывать шум там, где учёт не нужен.

Что делаем:

1. **Оплата в один клик**: кнопки «Наличные» и «Карта» там, где видна оплата. Окно остаётся для смешанной оплаты, товаров, даты и замены. Сразу после клика можно отменить.
2. **Учёт с даты**: у филиала есть момент начала учёта. Визиты и продажи раньше него никогда не «Оплата не указана».
3. **Настройка филиала «Учёт оплат»**: «Отмечать вручную» (по умолчанию) или «Не вести».

Вне задачи: автооплата «всегда одним способом» (отклонено), онлайн-оплата, виджет `klendo-widget` (см. 9.4).

Выручка, аналитика и зарплата не зависят от оплат и не меняются: их даёт завершение визита (крон `BookingCronService.completeElapsed` каждые 10 минут) и продажа.

## 1. Решения коротко

| Вопрос | Решение |
| --- | --- |
| Где кнопки в один клик | Поповер визита в календаре, страница записи, список «Оплата не указана» в сводке календаря, страница продажи |
| Когда показываются | Учёт включён, статус `NOT_SPECIFIED`, визит начался или завершён, есть право на первую оплату, нет черновых товаров, которые этот человек может продать |
| Будущий визит (предоплата) | Кнопок нет, тихое действие «Указать оплату» открывает окно, как сейчас |
| `NO_SHOW`, `CANCELLED` | Кнопок нет, как сейчас (окно, если есть проданные товары) |
| `UNDERPAID`, `OVERPAID`, `PAID` | Кнопок нет, как сейчас («Изменить», «Вернуть деньги») |
| Черновые товары | При черновиках и праве их продать - кнопок нет, «Оплатить» открывает окно с отмеченными товарами. Один клик никогда не продаёт и не пропускает черновик молча |
| Сумма | Сервер берёт сумму к оплате сам. Клиент присылает `expectedAmount` (что видел на экране) и `expectNoPayment: true`; расхождение - 409, оплату не пишем |
| Двойной клик | Ключ идемпотентности на намерение + блокировка кнопок на время запроса; разные кнопки подряд - 409 `PAYMENT_ALREADY_RECORDED` |
| Отмена ошибки | Тост «Отменить» 10 секунд. Новый эндпоинт отмены визита: автор операции, не позже 10 минут, без `order:write` (мастер может отменить свою оплату). Продажа - существующее аннулирование (`order:write`) |
| Завершение при отмене | Отмена оплаты не возвращает статус визита: визит начался, крон всё равно бы его завершил |
| Оптимистичное обновление | Нет. Кнопка в состоянии загрузки до конца запроса и перезагрузки данных |
| Статус до начала учёта и при выключенном учёте | Новый `PaymentStatus.NOT_TRACKED`: записей нет, к оплате > 0, учёт не ведётся для этого визита или продажи. Везде одинаково: карточка записи, календарь, заказ, сводка |
| Записи журнала до начала учёта | Обычный статус (`PAID` и т. д.): деньги есть - показываем |
| Оплата старых визитов | Разрешена (тихое «Указать оплату» через окно) |
| Учёт выключен: запись оплаты | Сервер отклоняет новые оплаты (409 `PAYMENT_TRACKING_DISABLED`). Возвраты, аннулирование и возврат денег при возврате товара работают |
| Учёт снова включён | `paymentTrackingSince` = момент сохранения, промежуток не становится «не указана» |
| Где настройка | `Location.paymentTrackingMode` + `Location.paymentTrackingSince`, правка через `PUT /locations/:locationId` (`location.settings:write`), чтение в `LocationResponseDto` (уже приходит фронтенду в списке филиалов, лишнего запроса нет) |

## 2. Модель

### 2.1 Поля филиала

```prisma
enum PaymentTrackingMode {
  MANUAL
  DISABLED
}

model Location {
  // ...
  paymentTrackingMode  PaymentTrackingMode @default(MANUAL)
  paymentTrackingSince DateTime            @default(now())
}
```

- `MANUAL` - «Отмечать вручную». Визиты с `startAt >= paymentTrackingSince` и продажи с `occurredAt >= paymentTrackingSince` учитываются.
- `DISABLED` - «Не вести». Ничего не учитывается, `paymentTrackingSince` хранит последнее значение и не используется.
- Enum, а не boolean: следующий режим (онлайн-оплата) добавляется значением.
- Новый филиал: `MANUAL`, начало - момент создания (default).

### 2.2 Правило «учитывается ли»

Новый файл `src/modules/payments/rules/payment-tracking.rules.ts` (чистая функция, без БД):

```ts
/** Whether a visit (by startAt) or a sale (by occurredAt) at `at` is in payment tracking. */
export function isPaymentTracked(tracking: PaymentTracking, at: Date): boolean {
  return (
    tracking.mode === PaymentTrackingMode.MANUAL &&
    at.getTime() >= tracking.since.getTime()
  );
}

/** 409 PAYMENT_TRACKING_DISABLED when the location does not track payments. */
export function assertPaymentTrackingEnabled(tracking: PaymentTracking): void;
```

`PaymentTracking` - `src/modules/location/interfaces/payment-tracking.interface.ts`: `{ mode: PaymentTrackingMode; since: Date }`. Enum - `src/modules/location/enums/payment-tracking-mode.enum.ts` (зеркало Prisma enum).

Момент учёта:

| Что | Момент |
| --- | --- |
| Визит (карточка, календарь, сводка, заказ визита) | `Booking.startAt` |
| Продажа (заказ без записи) | `Order.occurredAt` |

Заказ визита в `OrderResponseDto` тоже берёт `Booking.startAt` (через `BookingVisitsService.findByBookingIds`, модуль `BookingVisitsModule` Orders уже импортирует), а не `Order.occurredAt`: иначе страница заказа и карточка записи разошлись бы на границе.

### 2.3 Производный статус

`PaymentStatus` получает новое значение `NOT_TRACKED`. `paymentStatus` в `payments/rules/payment-state.rules.ts`:

```ts
export function paymentStatus(
  amountDue: Prisma.Decimal,
  totals: Pick<PaymentTotals, 'paidAmount' | 'hasRecords'>,
  tracked: boolean,
): PaymentStatus {
  if (!totals.hasRecords) {
    if (amountDue.lte(0)) return PaymentStatus.NOT_REQUIRED;
    return tracked ? PaymentStatus.NOT_SPECIFIED : PaymentStatus.NOT_TRACKED;
  }
  // PAID / UNDERPAID / OVERPAID as now
}
```

| Статус | Условие |
| --- | --- |
| `NOT_REQUIRED` | Записей нет, `due = 0` (не зависит от учёта) |
| `NOT_SPECIFIED` | Записей нет, `due > 0`, учитывается |
| `NOT_TRACKED` | Записей нет, `due > 0`, не учитывается (учёт выключен или раньше начала) |
| `PAID`, `UNDERPAID`, `OVERPAID` | Есть активные записи, как раньше. Учёт на них не влияет |

Почему отдельный статус, а не `NOT_REQUIRED` или `null`: `NOT_REQUIRED` означает «платить нечего», а здесь платить было что, и окно оплаты должно знать сумму; `null` ломает существующие типы и `paymentStatus` календаря, где `null` значит «блок, не запись». `NOT_TRACKED` явно говорит фронтенду «ничего не показывать».

Параметр `tracked` обязательный (без значения по умолчанию): компилятор найдёт все места вычисления статуса.

### 2.4 Переключение режима

Чистое правило `src/modules/location/rules/payment-tracking-switch.ts`:

```ts
/** The fields to write when the mode is set; empty when nothing changes. */
export function paymentTrackingPatch(
  current: PaymentTrackingMode,
  requested: PaymentTrackingMode | undefined,
  now: Date,
): { paymentTrackingMode?: PaymentTrackingMode; paymentTrackingSince?: Date };
```

| Было | Пришло | Пишем |
| --- | --- | --- |
| любое | не передано или то же | ничего |
| `DISABLED` | `MANUAL` | `mode = MANUAL`, `since = now` |
| `MANUAL` | `DISABLED` | `mode = DISABLED` (`since` не трогаем) |

`paymentTrackingSince` клиент не присылает и не меняет (вопрос 1).

## 3. API

Все ответы в `BaseResponseDto`, как обычно. Деньги - строки с двумя знаками.

### 3.1 Филиал

**`GET /locations/:locationId`**, **`GET /brands/:brandId/locations`** - `LocationResponseDto` получает:

```json
{
  "paymentTrackingMode": "MANUAL",
  "paymentTrackingSince": "2026-11-21T09:30:00.000Z"
}
```

| Поле | Тип | Смысл |
| --- | --- | --- |
| `paymentTrackingMode` | `PaymentTrackingMode` (`MANUAL` \| `DISABLED`), enumName `PaymentTrackingMode` | Режим учёта |
| `paymentTrackingSince` | date-time (UTC) | С какого момента учитываются визиты и продажи. При `DISABLED` не используется |

**`PUT /locations/:locationId`** (право `location.settings:write`, без изменений) - `UpdateLocationDto` получает:

| Поле | Правило |
| --- | --- |
| `paymentTrackingMode?: PaymentTrackingMode` | `IsOptional`, `IsEnum`. Переход по 2.4 |

`paymentTrackingSince` в `UpdateLocationDto` нет; если клиент его пришлёт, `whitelist` его отбросит (как остальные неизвестные поля).

Публичные DTO (`LocationPublicResponseDto`, `GET /locations/:locationId/public`) не меняются.

Чтение режима: не из кэша настроек, а одним select из БД (раздел 11): режим решает запись денег, устаревший кэш другой реплики не должен на это влиять. `LOCATION_SETTINGS_SELECT` полей учёта не получает. Новый метод:

```ts
/** Payment tracking of an active location, read from the database. */
LocationService.getPaymentTracking(locationId: string): Promise<PaymentTracking>
```

Аудит: `LOCATION_AUDIT_FIELDS` + `{ key: 'paymentTrackingMode', i18n: 'paymentTrackingMode' }`; `ru.json`: подпись поля «Учёт оплат», значения `MANUAL` - «Отмечать вручную», `DISABLED` - «Не вести». `paymentTrackingSince` в аудит не идёт (производное).

### 3.2 Статус оплаты в чтении

`PaymentStatus` в OpenAPI (enumName `PaymentStatus`): добавляется `NOT_TRACKED`. Описание поля `status` в `PaymentSummaryDto` дополняется.

Где меняется значение (одно правило 2.3 везде):

| Ответ | Источник `tracked` |
| --- | --- |
| `GET /locations/:locationId/bookings/:id` -> `payment` (`BookingPaymentDto`) | `isPaymentTracked(tracking, booking.startAt)` |
| `GET /locations/:locationId/calendar...` -> `CalendarEventItemDto.paymentStatus` | то же, пакетно |
| `GET /locations/:locationId/orders`, `GET .../orders/:orderId` -> `payment` | продажа - `order.occurredAt`, заказ визита - `Booking.startAt` |
| `GET .../dashboard/finance-summary` -> `notSpecified` | см. 3.6 |

**`BookingPaymentDto`** получает новое поле:

| Поле | Тип | Смысл |
| --- | --- | --- |
| `draftProductsCount` | integer >= 0 | Черновые (`PRODUCT`/`DRAFT`) позиции заказа визита. 0 без заказа |

Пример `payment` в карточке записи старого визита:

```json
{
  "status": "NOT_TRACKED",
  "amountDue": "1500.00",
  "paidAmount": "0.00",
  "cashAmount": "0.00",
  "cardAmount": "0.00",
  "payment": null,
  "refunds": [],
  "orderId": "uuid",
  "servicesAmount": "1500.00",
  "productsAmount": "0.00",
  "draftProductsCount": 0
}
```

### 3.3 Новые поля оплаты (быстрая оплата)

`PaymentInputDto` (`payments/dto/payment-input.dto.ts`, оплата со своим ключом) получает два необязательных поля. Поэтому они есть у `PUT .../bookings/:id/payment`, `PUT .../orders/:orderId/payment`, `payment` в `POST .../bookings/manual` и `PUT .../bookings/:id` (там фронтенд их не шлёт).

```json
{
  "method": "CARD",
  "expectedAmount": "1500.00",
  "expectNoPayment": true,
  "idempotencyKey": "6c0f..."
}
```

| Поле | Правило |
| --- | --- |
| `expectedAmount?: string \| null` | `IsOptionalPositivePrice`, > 0. Только с `CASH` или `CARD`; с `MIXED` - 400 `PAYMENT_SPLIT_INVALID`. Если не равно сумме, которую должна покрыть оплата (`requiredAmount` = `due` + активные возвраты), - 409 `PAYMENT_AMOUNT_MISMATCH` с `responseValue { amountDue, requiredAmount }`, ничего не пишется (и визит не завершается: откат транзакции) |
| `expectNoPayment?: boolean` | `IsOptional`, `IsBoolean`. `true` и у заказа уже есть активная оплата - 409 `PAYMENT_ALREADY_RECORDED` с `responseValue { operationId }` (активная оплата), ничего не пишется |

Оба поля входят в hash намерения (`paymentIntent` в `payments/rules/payment-request-hash.ts`: `expectedAmount` форматируется `MoneyUtils.format` или `null`, `expectNoPayment` - `true` или `null`). Повтор с тем же ключом возвращает первый результат до этих проверок (порядок `findReplay` не меняется), поэтому двойной клик получает 200, а не 409. Hash старых операций меняется: прода нет, совместимость не нужна.

Проверки живут в `PaymentLedgerService.record` (ожидания приходят в `PaymentRequest`: `expectedAmount: Prisma.Decimal | null`, `expectNoPayment: boolean`; собирает их чистая `paymentRequest` в `payments/rules/payment-request.rules.ts`, она же даёт 400 для `MIXED`). Чистые функции `assertNoPaymentExpected` и `assertExpectedAmount` - в `payments/rules/payment-expectations.rules.ts`. Порядок проверок в `record`: учёт включён (3.5) -> `expectNoPayment` -> право замены -> `requiredAmount > 0` -> `expectedAmount` -> части. `expectNoPayment` стоит раньше права замены: мастер без `order:write`, нажавший после чужой оплаты, получает 409 `PAYMENT_ALREADY_RECORDED`, а не 403.

### 3.4 Отмена оплаты визита

**`POST /locations/:locationId/bookings/:id/payment/undo`** - новый.

- Назначение: отменить только что записанную оплату (ошибка клика). Аннулирует все записи операции, как `void`, с причиной `PAYMENT_UNDO_VOID_REASON = 'Отменено сразу после записи'`.
- Тело `UndoBookingPaymentDto`: `{ "operationId": "uuid" }` (`IsUUID`).
- Ответ: `BaseResponseDto<IdResponseDto>` с `id` записи. HTTP 200 (`@HttpCode(HttpStatus.OK)`).
- Права: `@Permissions([Write(Claim.BOOKING), Write(Claim.BOOKING_OWN)])` + `access.assertManage(token, booking)` (мастер - только свой визит). `order:write` не нужен.
- Правила (чистая функция `assertPaymentUndoable(operation, { actorId, hasActiveRefunds, now })` в `payments/rules/payment-undo.rules.ts`, константа `PAYMENT_UNDO_WINDOW_MS = 10 * 60_000` в `payments/constants/payment.constants.ts`):

| Условие | Ответ |
| --- | --- |
| Записи нет или удалена | 404 `Booking not found` |
| У записи нет заказа, операции нет в заказе визита | 404 `PAYMENT_OPERATION_NOT_FOUND` |
| Все записи операции уже аннулированы | 200, ничего не меняется (идемпотентно) |
| Операция не `PAYMENT`, или `replacesOperationId != null`, или у заказа есть активные возвраты | 409 `PAYMENT_UNDO_NOT_ALLOWED` |
| `operation.createdById !== actor.id` | 409 `PAYMENT_UNDO_NOT_ALLOWED` |
| `now - operation.createdAt > 10 минут` | 409 `PAYMENT_UNDO_EXPIRED` |
| Иначе | Аннулировать, аудит `PAYMENT_VOIDED` после commit |

- Статус визита не меняется: если оплата завершила визит, он остаётся `COMPLETED` (начисления тоже). Визит уже начался, крон завершил бы его в течение 10 минут; откат завершения потребовал бы отката начислений и синхронизации заказа - не стоит этого.
- Работает и при выключенном учёте (исправление ошибки).
- Блокировки: как у `void` - `BookingVisitsService.lockForOrder` (запись `FOR SHARE`) -> заказ `FOR UPDATE` -> журнал.

Почему отдельный эндпоинт, а не ослабление `POST .../orders/:orderId/payment-operations/:operationId/void`: тот эндпоинт защищён `order:write` на уровне декоратора и служит исправлению любой операции. Отмена - узкое право автора на свежую первую оплату своего визита, по тем же правам, что и первая оплата. Для продаж отдельный эндпоинт не нужен: оплату продажи записывает только `order:write`, а он может аннулировать.

Реализация: `BookingsController.undoPayment` (`BookingAccessService.assertManageParticipant`) -> `BookingsFacade.undoPayment` -> `BookingPaymentService.undo(booking, operationId, actor, now, participantStaffId)` -> `OrderPaymentsFacade.undoVisitPayment({ locationId, bookingId, operationId, actor, now, participantStaffId })` -> `OrderPaymentCorrectionService.undoVisitPayment` (сервис исправлений, там же `voidOperation`; `OrderLockService.lockVisitOrder` блокирует запись `FOR SHARE`, находит заказ визита и блокирует его; `assertVisitParticipant` повторно проверяет мастера) -> `PaymentsFacade.undo` -> `PaymentLedgerService.undo` (поиск операции, `isOperationVoided` из `payments/rules/payment-void.rules.ts`, `assertPaymentUndoable(operation, { actorId, hasActiveRefunds, now })`, аннулирование). Если заказа нет - 404 `PAYMENT_OPERATION_NOT_FOUND`.

### 3.5 Запись оплаты при выключенном учёте

Единая точка: `PaymentsFacade.record` до вызова ledger вызывает `locations.getPaymentTracking(command.locationId)` и `assertPaymentTrackingEnabled` -> 409 `PAYMENT_TRACKING_DISABLED`. Так закрыты все входы: `PUT .../bookings/:id/payment`, `payment` в `POST .../bookings/manual` и `PUT .../bookings/:id`, `PUT .../orders/:orderId/payment`, `payment` в `POST .../orders` и `POST .../orders/:orderId/items/confirm`. Ошибка внутри транзакции откатывает всё (запись, правку, завершение, проведение товаров).

`PaymentsModule` импортирует `LocationModule` (цикла нет: `LocationModule` импортирует только Cache, Brand, BookingDeletionPolicy, BillingCore).

Остаются разрешены при `DISABLED`:

| Действие | Почему |
| --- | --- |
| `POST .../orders/:orderId/refunds` | Деньги, записанные раньше, должны уметь вернуться |
| `POST .../orders/:orderId/returns` с `refund` | Возврат товара оплаченного заказа возвращает деньги атомарно, как раньше (`ORDER_RETURN_REFUND_REQUIRED` действует) |
| `POST .../payment-operations/:operationId/void`, `POST .../bookings/:id/payment/undo` | Исправление ошибки |
| `DELETE` записи, аннулирование продажи | Без изменений (`BOOKING_HAS_PAYMENTS`, `ORDER_HAS_PAYMENTS` по-прежнему по журналу) |

Почему сервер отклоняет, а не только UI прячет: при «Не вести» в сводке нет списка «не указана», а оплата, записанная из старой вкладки, тихо появилась бы в деньгах периода, которые никто не сверяет. Явная ошибка дешевле: фронтенд показывает понятный текст и обновляет филиал.

До начала учёта (режим `MANUAL`, визит раньше `since`) оплата разрешена: кто-то хочет отметить старый визит - пусть отмечает.

### 3.6 Сводка

**`GET /locations/:locationId/dashboard/finance-summary`** - форма ответа та же, плюс поле у элемента списка.

`FinanceSummaryService.summary`:

- `DISABLED` -> `notSpecified = { amount: "0.00", count: 0, items: [] }` без запроса списка. `money` и `refunds` считаются как обычно (журнал может быть).
- `MANUAL` -> список считается по диапазону `{ from: max(range.from, since), to: range.to }`; если `from >= to` - пустой список без запроса. Деньги - по полному диапазону.

Обрезка диапазона - чистая функция `trackedRange(range, tracking)` в `dashboard/rules/finance-tracked-range.ts` (возвращает `FinanceRange | null`). SQL `OrdersAggregatesService.notSpecified` не меняется по условиям, только получает уже обрезанный диапазон. Визит учитывается по `startAt`, продажа по `occurredAt` - ровно те же поля, по которым SQL выбирает день, поэтому обрезка диапазона даёт то же, что 2.3.

`FinanceNotSpecifiedItemDto` получает:

| Поле | Тип | Смысл |
| --- | --- | --- |
| `draftProductsCount` | integer >= 0 | Черновые позиции заказа (визита или продажи). 0 без заказа |
| `bookingStatus` | `BookingStatus` \| null (enumName `BookingStatus`) | Статус визита (`COMPLETED`, `NO_SHOW`, `CANCELLED`; у удалённой записи любой). `null` у продажи. По нему фронтенд показывает окно вместо кнопок для `NO_SHOW`/`CANCELLED` (вопрос 10.7) |

`bookingStatus` берётся из `BookingsAggregatesService.closedVisitsSql` (колонка `status`).

SQL: `LEFT JOIN LATERAL (SELECT COUNT(*)::int AS n FROM "OrderItem" d WHERE d."orderId" = o."id" AND d."type"::text = 'PRODUCT' AND d."status"::text = 'DRAFT') drafts ON TRUE` в обеих ветках `due_rows`, `COALESCE(drafts.n, 0)`. Поле в `NotSpecifiedRow`.

### 3.7 Остальное без изменений

`PATCH .../status`, `POST .../cancel`, `DELETE`, возвраты, сводка `money` - как раньше. Новых claim нет. `docs/frontend-permissions.json` не меняется.

### 3.8 Коды ошибок (новые)

| Код | HTTP | Когда | `responseValue` |
| --- | --- | --- | --- |
| `PAYMENT_TRACKING_DISABLED` | 409 | Новая оплата при `paymentTrackingMode = DISABLED` | - |
| `PAYMENT_ALREADY_RECORDED` | 409 | `expectNoPayment: true`, а оплата уже есть | `{ operationId }` |
| `PAYMENT_UNDO_NOT_ALLOWED` | 409 | Отмена не своей операции, не первой оплаты, при возвратах | - |
| `PAYMENT_UNDO_EXPIRED` | 409 | Прошло больше 10 минут | - |

Сообщения в `ErrorCode` (английские, как остальные): `'Payment tracking is disabled in this location'`, `'The order already has a payment'`, `'Only the author can undo a first payment without refunds'`, `'The payment can no longer be undone'`.

Существующие коды с новым поводом: `PAYMENT_AMOUNT_MISMATCH` (несовпадение `expectedAmount`), `PAYMENT_SPLIT_INVALID` (`expectedAmount` с `MIXED`), `PAYMENT_OPERATION_NOT_FOUND` (отмена).

### 3.9 Миграция

`src/database/migrations/20261121120000_payment_tracking/migration.sql`:

```sql
CREATE TYPE "PaymentTrackingMode" AS ENUM ('MANUAL', 'DISABLED');

ALTER TABLE "Location"
  ADD COLUMN "paymentTrackingMode" "PaymentTrackingMode" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "paymentTrackingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

Существующие филиалы получают момент миграции: вся история до неё - `NOT_TRACKED`, «Оплата не указана» пропадает сразу. Backfill журнала нет. Прода нет, совместимость не нужна.

## 4. Бэкенд: файлы и ответственность

Сервисы тонкие, логика в чистых правилах, по одному классу/enum/интерфейсу на файл (CLAUDE.md crm-core).

Схема и общие:

- `src/database/schema.prisma`, миграция 3.9.
- `src/shared/validation/error-codes.enum.ts` - 4 кода.
- `src/shared/i18n/ru.json` - поле и значения `paymentTrackingMode`.
- `src/modules/audit/fields/location.fields.ts`.

Location:

- `enums/payment-tracking-mode.enum.ts`, `interfaces/payment-tracking.interface.ts`, `rules/payment-tracking-switch.ts` + spec.
- `dto/update-location.dto.ts`, `dto/location-response.dto.ts`, `interfaces/payment-tracking-patch.interface.ts`.
- `services/location.service.ts`: `update` применяет `paymentTrackingPatch` (DTO без `paymentTrackingMode` + патч), новый `getPaymentTracking`.

Payments:

- `enums/payment-status.enum.ts` (`NOT_TRACKED`).
- `rules/payment-tracking.rules.ts`, `rules/payment-expectations.rules.ts`, `rules/payment-request.rules.ts`, `rules/payment-undo.rules.ts`, `rules/payment-void.rules.ts` (`isOperationVoided` и условия аннулирования), `rules/payment-audit.rules.ts` (запись истории заказа) + spec у каждого.
- `rules/payment-state.rules.ts` (`tracked`, `paymentStatusOf`, `activePaymentOperationId`, `assertRefundWithinLimit`), `rules/payment-parts.rules.ts` (`requiredPaymentAmount`), `rules/payment-occurred-at.rules.ts` (`recordedPaymentDate`), `rules/payment-request-hash.ts` (новые поля в намерении).
- `dto/payment-input.dto.ts` (`expectedAmount`, `expectNoPayment`), `dto/payment-summary.dto.ts` (`from(amountDue, totals, tracked)`).
- `interfaces/payment-command.interface.ts`, `interfaces/payment-intent-input.interface.ts`, `interfaces/payment-expectations.interface.ts`, `interfaces/undo-payment-command.interface.ts`, `interfaces/new-payment-operation.interface.ts`.
- `constants/payment.constants.ts` (`PAYMENT_UNDO_WINDOW_MS`, `PAYMENT_UNDO_VOID_REASON`).
- `services/payment-ledger.service.ts` (`record`: ожидания; `undo`), `payments.facade.ts` (`record`: проверка учёта; `undo`; `lockKeyForReplay` и `lockUnusedKey` - первый шаг действия с ключом), `payments.module.ts` (импорт `LocationModule`).

Bookings:

- `controllers/bookings.controller.ts`: `POST :id/payment/undo`; передача новых полей в `PayBookingDto` уже идёт через наследование. `services/booking-access.service.ts`: `assertManageParticipant` (проверка права и мастер для повторной проверки под блокировкой).
- `dto/undo-booking-payment.dto.ts`, `dto/booking-payment.dto.ts` (`draftProductsCount`).
- `services/write/booking-payment.service.ts`: `undo`; ожидания (`expectedAmount`/`expectNoPayment`) идут в команду внутри `PaymentRequest`. Условия шага - чистые правила `rules/visit-payment-step.rules.ts`.
- `services/read/booking-payment-read.service.ts`: читает `getPaymentTracking` один раз на пачку (все записи пачки из одного филиала; если нет - по `locationId` каждой), `tracked` и `draftProductsCount` в `VisitPaymentSummary`.
- `interfaces/visit-summary-booking.interface.ts` (+ `startAt`, `locationId`), `interfaces/visit-payment-summary.interface.ts` (+ `tracked`, `draftProductsCount`).
- `services/read/booking-calendar-read.service.ts`: `select` + `startAt`, `locationId`; статус через `paymentStatusOf(summary.amountDue, summary.totals, summary.tracked)`.

Orders:

- `interfaces/booking-order-products.interface.ts` (+ `draftProductsCount`), `services/order-persistence.service.ts` (`productTotalsByBookings` читает и черновики).
- `dto/order-response.dto.ts` (`fromEntity(entity, payment: OrderPaymentView)`), `controllers/orders.controller.ts` (список и карточка берут `OrderPaymentsFacade.paymentViews(locationId, orders)`: журнал и `tracked` каждого заказа; `tracked` считает `OrderPaymentTrackingService` - одна `getPaymentTracking` + `BookingVisitsService.startAtByBookingIds` для заказов визитов).
- `order-payments.facade.ts` (`OrderPaymentsFacade`), `services/order-payment-correction.service.ts` (`voidOperation`, `undoVisitPayment`), `services/order-lock.service.ts`, `rules/order-payment-correction.rules.ts`, `rules/order-payment-tracking.rules.ts`.
- `aggregates/services/orders-aggregates.service.ts`, `aggregates/interfaces/not-specified-row.interface.ts` (черновики), `aggregates/rules/not-specified.rules.ts` (строки и итоги списка).

Dashboard:

- `services/finance-summary.service.ts`, новые `rules/finance-tracked-range.ts` и `rules/finance-summary-period.ts` + spec, `dto/finance-not-specified-item.dto.ts`.

Документация:

- `docs/payments-plan.md` - ссылка на этот документ в шапке, `NOT_TRACKED` в 1.5.
- `docs/orders.md`, `docs/architecture/booking-write-flows.md` (отмена оплаты), OpenAPI: в `crm-core` файла `docs/openapi.json` нет, схему отдаёт запущенный сервер (`/api-json`); копию в `crm-frontend/docs/openapi.json` обновляет фронтенд.

## 5. Фронтенд: UX

### 5.1 Принципы

- Главный путь - два клика: открыть визит, нажать способ. Сумма видна рядом («К оплате 1 500 ₽»), на кнопках только способ.
- Кнопки быстрой оплаты появляются только когда визит уже идёт или прошёл и оплаты нет. Иначе - как сейчас.
- Ошибочный клик исправляется одной кнопкой в тосте.
- Нет учёта - нет ни одного слова про оплату там, где её нет.

### 5.2 Тексты

| Где | Текст |
| --- | --- |
| Кнопки быстрой оплаты | «Наличные», «Карта» |
| Открыть окно | «Другая оплата» |
| Тихое действие (будущий или старый визит) | «Указать оплату» (уже есть) |
| Тост успеха, визит завершён этой оплатой | «Визит завершён. Карта, 1 500 ₽» / «Визит завершён. Наличные, 1 500 ₽» |
| Тост успеха, иначе | «Оплачено: карта, 1 500 ₽» / «Оплачено: наличные, 1 500 ₽» |
| Действие в тосте | «Отменить» (10 секунд) |
| Тост после отмены | «Оплата отменена» |
| `PAYMENT_AMOUNT_MISMATCH` | «Сумма изменилась: {requiredAmount}. Проверьте и оплатите снова» |
| `PAYMENT_ALREADY_RECORDED` | «Оплату уже отметили» |
| `PAYMENT_TRACKING_DISABLED` | «В филиале выключен учёт оплат» |
| `PAYMENT_UNDO_EXPIRED` | «Отменить уже нельзя. Измените оплату в записи» |
| `PAYMENT_UNDO_NOT_ALLOWED` | «Эту оплату может изменить только администратор» |
| Сеть или прочее | «Не удалось отметить оплату» / «Не удалось отменить оплату» |
| Сводка, период частично до начала учёта | «Оплаты отмечаются с 21 ноября» |
| Настройка, заголовок | «Учёт оплат» |
| Вариант 1 | «Отмечать вручную» - «Видно, какие визиты не оплачены. Оплату отмечают кнопками «Наличные» и «Карта».» |
| Вариант 2 | «Не вести» - «Оплаты не отмечаются. Выручка и зарплата считаются как обычно.» |
| Подсказка при включении (было «Не вести») | «Учёт начнётся с момента сохранения. Прошлые визиты не попадут в «Оплата не указана».» |
| Подсказка при выключении (было «Отмечать вручную») | «Отмеченные оплаты сохранятся, вернуть по ним деньги можно как обычно.» |
| Под настройкой в режиме «Отмечать вручную» | «Учёт с 21 ноября 2026» (дата `paymentTrackingSince` по часам филиала, `fZoned*`) |
| Карточка филиала (просмотр) | Label success «Оплаты отмечаются» + «С 21 ноября 2026»; Label default «Оплаты не ведутся» + «Выручка и зарплата считаются как обычно.» |

Сумма в тостах - `formatMoney(amountDue, currency)`; способ в нижнем регистре после двоеточия, с заглавной после точки.

### 5.3 Состояния по экранам

Обозначения: **БО** - кнопки «Наличные» «Карта» + «Другая оплата»; **окно** - `PayBookingDialog`/`PayOrderDialog`.

**Поповер визита в календаре** (`views/calendar/ui/calendar-booking-popover.tsx`, блок «К оплате», `BookingPaymentStatus` layout `Inline`) и **страница записи** (`views/bookings/view/booking-detail-view.tsx`, layout `Stack`):

| Состояние | Строка оплаты | Действия |
| --- | --- | --- |
| Учёт `DISABLED`, записей нет (`NOT_TRACKED`/`NOT_REQUIRED`) | Нет | Нет |
| Учёт `DISABLED`, записи есть | Как сейчас («Карта», «Переплата 500 ₽») | Только «Вернуть деньги» при `OVERPAID` и `order:write`. «Изменить» нет |
| `MANUAL`, визит раньше начала учёта (`NOT_TRACKED`) | Нет | «Указать оплату» (тихое, окно), если есть право первой оплаты |
| `NOT_SPECIFIED`, визит начался (PENDING/CONFIRMED, идёт или прошёл) или `COMPLETED`, нет черновиков, которые человек может продать | «Оплата не указана» | **БО** |
| То же, но есть черновики (`draftProductsCount > 0`) и `order:write` | «Оплата не указана» | «Оплатить» (главное, окно, черновики отмечены) - как сейчас |
| То же, черновики есть, но нет `order:write` (мастер) | «Оплата не указана» | **БО** (мастер всё равно не может продать черновики; окно у него их тоже не показывает) |
| `NOT_SPECIFIED`, визит не начался | «Оплата не указана» | «Указать оплату» (тихое, окно) - как сейчас |
| `NOT_SPECIFIED`, `NO_SHOW`/`CANCELLED` (проданы товары) | «Оплата не указана» | Как сейчас (окно) |
| `PAID` | «Карта» и т. п. | «Изменить» (`order:write`) - как сейчас |
| `UNDERPAID`/`OVERPAID` | «Недоплата N» / «Переплата N» | Как сейчас («Изменить», «Вернуть деньги») |
| Нет права первой оплаты (чужой визит мастера, только чтение) | Строка как выше | Нет |

Поповер: после быстрой оплаты не закрывается, строка становится «Карта», в тосте «Отменить». «Завершить» остаётся в «Ещё» (`completeInMenu`), пока статус `NOT_SPECIFIED`.

Раскладка **БО**:

- `Inline` (поповер): строка «Оплата не указана», под ней ряд `[Наличные] [Карта]` («Карта» `variant="contained"`, «Наличные» `variant="outlined"`, обе `color="inherit"`: карта чаще, как выбор по умолчанию в окне) и текстовая «Другая оплата». `size="small"`. На xs ряд на всю ширину: две кнопки по 50%, «Другая оплата» отдельной строкой слева. Высота кнопок на xs 40 px.
- `Stack` (страница записи, боковая карточка): строка, затем две кнопки в ряд по 50% (`size="medium"`), под ними `Button variant="text" fullWidth` «Другая оплата».
- Иконки: «Наличные» - `solar:wad-of-money-bold`, «Карта» - `solar:card-bold` (как в `PaymentStateLine`).

Загрузка: нажатая кнопка `loading`, вторая и «Другая оплата» `disabled` до конца запроса и перезагрузки данных. Ошибка - `toast.error` с текстом из 5.2, кнопки снова доступны; при `PAYMENT_AMOUNT_MISMATCH` и `PAYMENT_ALREADY_RECORDED` данные визита перезагружаются (новая сумма или «Карта» в строке).

**Сводка в календаре** (`views/calendar/ui/calendar-finance-summary.tsx`):

| Состояние | Что видно |
| --- | --- |
| Учёт `DISABLED` | Кнопки сводки в тулбаре нет |
| `MANUAL`, период начинается раньше дня начала учёта | Под «Поступления по дню оплаты» строка «Оплаты отмечаются с 21 ноября» |
| Строка визита, нет черновиков, есть `booking:write` | `[Наличные] [Карта]` (`size="small"`, `outlined`) вместо «Оплатить» |
| Строка визита с черновиками и `order:write` | «Оплатить» (окно через `PayBookingById`) - как сейчас |
| Строка продажи, нет черновиков, `order:write` | `[Наличные] [Карта]` (`PUT orders/:orderId/payment`) |
| Строка продажи с черновиками или без `order:write` | «Открыть» - как сейчас |
| После оплаты строки | Строка остаётся с загрузкой до перезагрузки сводки, затем исчезает; счётчик и сумма уменьшаются; тост с «Отменить» |

Раскладка строки: текст слева (`noWrap`), кнопки справа; при ширине поповера < 360 px (телефон 390) кнопки переносятся под текст (`flexWrap: 'wrap'`, кнопки `ml: 'auto'`). Кнопки `onPointerEnter`/`onFocus` больше не нужны для быстрой оплаты (окно не открывается); прогрев визита остаётся только у «Оплатить».

**Календарь, карточки визитов** (`views/calendar/model/calendar-board.ts`): кода не меняем - оранжевый кошелёк и «· оплата не указана» только при `NOT_SPECIFIED`, а старые визиты и выключенный учёт приходят `NOT_TRACKED`.

**Окно записи** (`features/booking-window`, `BookingPaymentSection`): при `DISABLED` блока «Оплата» нет ни при создании, ни при правке, `payment` не отправляется. При `MANUAL` - как сейчас (в том числе для прошлых визитов раньше начала учёта).

**Продажи**:

- Новая продажа (`features/edit-order/ui/sale-payment-field.tsx`): при `DISABLED` поля «Оплата» нет, `payment` не отправляется.
- Страница продажи (`OrderPaymentStatus`, `views/orders/view/order-detail-view.tsx`): `NOT_SPECIFIED`, `ACTIVE`, `order:write`, нет черновиков -> **БО** («Другая оплата» открывает `PayOrderDialog`). Черновики есть -> «Оплатить» (окно). `NOT_TRACKED` -> строки нет, действий нет при `DISABLED`; при `MANUAL` (старая продажа) - тихое «Указать оплату». Записи есть - как сейчас; при `DISABLED` без «Изменить».
- Заказ визита на странице заказа: сейчас статус подменяется на `NotSpecified`, если нет оплаты. Теперь: `NOT_TRACKED` -> строки и подписи «Оплата визита указывается в записи» нет.
- Возврат товара: «Как вернули деньги» показывается по-прежнему, когда `paidAmount > 0`, при любом режиме.

**Настройки филиала** (`features/edit-location-settings`): новая секция «Учёт оплат» после «Письма клиентам», перед адресом. `Field.RadioGroup` с двумя вариантами и подписями из 5.2, подсказка о включении/выключении показывается, когда значение формы отличается от сохранённого. Право - как у всей формы (`location.settings:write`). Карточка просмотра (`entities/location/ui/location-booking-info.tsx`) - строка с Label из 5.2.

### 5.4 Отмена

1. Успех быстрой оплаты -> `toast.success(text, { action: { label: 'Отменить', onClick }, duration: 10_000 })` (sonner, `src/shared/ui/snackbar`).
2. «Отменить» на визите -> `POST .../bookings/:id/payment/undo { operationId }`; на продаже -> существующий `POST .../orders/:orderId/payment-operations/:operationId/void` с `reason: 'Отменено сразу после записи'`.
3. Успех -> «Оплата отменена», перезагрузка тех же данных, что после оплаты. Ошибка -> текст из 5.2.
4. Тост живёт после закрытия поповера, поэтому отмена - обычная функция модели с `queryClient`, а не хук размонтированного компонента (см. 6).
5. Повторный клик по «Отменить» не нужен защищать отдельно: сервер идемпотентен, тост закрывается по клику.

Отмена показывается только для быстрой оплаты. Окно оплаты не меняется (у него есть «Убрать оплату» для `order:write`).

### 5.5 Клики: Klendo против YCLIENTS

Главный путь: визит идёт или прошёл, клиент платит картой, администратор отмечает.

| Шаг | YCLIENTS (по ресёрчу) | Klendo сейчас | Klendo после |
| --- | --- | --- | --- |
| Открыть визит | 1 (окно визита) | 1 (поповер) | 1 (поповер) |
| Отметить приход/завершение | 1 («Пришёл») | 0 (оплата завершает) | 0 |
| Открыть оплату | 1 (вкладка/кнопка оплаты) | 1 («Оплатить», окно) | 0 |
| Выбрать способ | 1 («Карта») | 0 (карта выбрана) | 1 («Карта») |
| Подтвердить | 0-1 | 1 («Оплатить и завершить») | 0 |
| **Итого** | **4-5** | **3** | **2** |

Конец дня, разбор «Оплата не указана»: в Klendo открыть сводку (1) и по одному клику на визит, не открывая сам визит. Ошибка исправляется одним кликом «Отменить».

### 5.6 Ширины

390: поповер визита - кнопки по 50%, «Другая оплата» строкой ниже; сводка - кнопки под текстом строки. 768: всё в одну строку. 1280 с открытым меню и 1440: без изменений вёрстки, кнопка сводки в тулбаре как сейчас.

## 6. Фронтенд: архитектура

FSD: `shared -> entities -> features -> widgets -> views -> app`. Компоненты маленькие, одна ответственность.

**entities/location**

- `model/location.types.ts`: `enum PaymentTrackingMode { Manual = 'MANUAL', Disabled = 'DISABLED' }`; поля в `LocationResponseDto`, `UpdateLocationDto` (`paymentTrackingMode?`), `LocationSearchItemDto` (`paymentTrackingMode`, `paymentTrackingSince`).
- `api/location.api.ts`: `toLocationSearchItem` копирует оба поля.
- `model/hooks/use-payment-tracking.ts`: `usePaymentTracking(locationId): { enabled: boolean; since: string | null; ready: boolean }` из `useLocationList()` (без запроса). Пока список грузится - `ready: false`, вызывающие ничего не прячут и не показывают преждевременно (блоки оплаты рендерятся только при `ready`).
- `ui/location-booking-info.tsx`: строка «Учёт оплат».

**entities/payment**

- `model/types.ts`: `PaymentStatus.NotTracked = 'NOT_TRACKED'`; `PaymentInputDto` + `expectedAmount?: string`, `expectNoPayment?: boolean`; `FinanceNotSpecifiedItemDto.draftProductsCount: number`.
- `model/payment-text.ts`: `paymentState` для `NotTracked` возвращает `null` (тип `PaymentState | null`); `PaymentStateLine` при `null` не рендерит ничего.
- `model/quick-pay.ts` (чистое): `QUICK_PAY_METHODS = [PaymentMethod.Cash, PaymentMethod.Card]`, `quickPayInput(method, amount): PaymentInputDto без ключа` (`{ method, expectedAmount: amount, expectNoPayment: true }`), `quickPaySuccessText({ method, amount, completed, money })`.
- `model/quick-pay-error.ts` (чистое): `quickPayErrorText(error, money)` и `paymentUndoErrorText(error)` по кодам 5.2.
- `ui/quick-pay-buttons.tsx`: презентационный. Props: `size`, `fullWidth`, `loadingMethod: PaymentMethod | null`, `disabled`, `onPay(method)`. Без запросов.

**entities/booking**

- Типы: `BookingPaymentDto.draftProductsCount`, `UndoBookingPaymentDto`.
- `api`: `undoPayment(locationId, id, data)` -> `POST /locations/{locationId}/bookings/{id}/payment/undo`.
- `model/mutations/booking-surfaces.ts`: вынести существующую `refreshBookingSurfaces` из `use-booking-mutations.ts` (экспорт внутри сущности).
- `model/mutations/undo-booking-payment.ts`: обычная async-функция `undoBookingPayment(queryClient, { locationId, bookingId, operationId })` - запрос + `refreshBookingSurfaces`. Её вызывает тост после размонтирования.

**entities/order**

- `model/mutations/void-order-payment.ts`: такая же обычная функция `voidOrderPaymentNow(queryClient, { locationId, orderId, operationId, reason })` с теми же инвалидациями, что `useVoidOrderPayment` (общий хелпер инвалидации, без дублей).

**features/manage-payment**

- `model/visit-payment-rules.ts`: в `VisitPaymentAccess` добавить `trackingEnabled: boolean`; в `VisitPaymentRules` - `quickPay: boolean` и `recordQuietly: boolean`. Правила:
  - `quickPay = trackingEnabled && canManage && status === NotSpecified && !replacing && (started && OPEN.has(status) || status === Completed) && !(draftProductsCount > 0 && canWriteOrders)`.
  - `payFirst` остаётся для случая с черновиками.
  - `recordQuietly` = `trackingEnabled && canPay && (status === NotSpecified && !started || status === NotTracked)`.
  - При `!trackingEnabled`: `canPay = false`, только `canRefund`.
- `model/use-visit-payment-rules.ts`: берёт `usePaymentTracking(locationId)`.
- `model/sale-payment-rules.ts` (чистое): `saleQuickPay(order, { canWrite, trackingEnabled })`.
- `model/use-quick-pay-booking.ts`: `useQuickPayBooking({ locationId, bookingId, amountDue, willComplete, currency })` -> `{ pay(method), loadingMethod }`. Внутри: `useIdempotencyKey` (намерение = `JSON.stringify({ bookingId, method, amountDue })`), `useRef` от двойного вызова, `usePayBooking` (сущность), успех -> `showPaymentUndoToast`, `reset()` ключа; ошибка -> `console.log(error)`, `toast.error(quickPayErrorText)`, при 409 суммы/уже записано - `invalidateQueries(bookingKeys.detail(id))` и `paymentKeys.all()`.
- `model/use-quick-pay-order.ts`: то же для продажи через существующую мутацию оплаты продажи.
- `model/payment-undo-toast.ts`: `showPaymentUndoToast({ text, undo: () => Promise<void> })` - тост с «Отменить», после отмены «Оплата отменена» или текст ошибки.
- `ui/booking-quick-pay.tsx`: `QuickPayButtons` + «Другая оплата» (открывает существующий `PayBookingDialog` через колбэк родителя).
- `ui/order-quick-pay.tsx`: то же для продажи.
- `ui/not-specified-quick-pay.tsx`: кнопки для строки сводки (визит или продажа по `item.kind`), только кнопки, без «Другой оплаты».
- `ui/payment-status-view.tsx`: новый необязательный слот `quickPay?: ReactNode` между строкой и действиями; `PaymentActionKind.Other` с подписью «Другая оплата».
- `ui/booking-payment-status.tsx`, `ui/order-payment-status.tsx`: выбирают между **БО** и текущими действиями по правилам; рендер ничего, если строки нет и действий нет.
- `index.ts`: экспортировать `NotSpecifiedQuickPay`.

**views/calendar**: `calendar-finance-summary.tsx` - скрыть при `!enabled`, строка «Оплаты отмечаются с …», в `UnspecifiedItem` - `NotSpecifiedQuickPay` вместо «Оплатить», когда правила разрешают. Файл уже большой: вынести `UnspecifiedItem` в `ui/calendar-finance-unspecified-item.tsx`. В рабочем дереве есть незакоммиченные правки календаря - сначала их сохранить или согласовать.

**features/booking-window**: `use-create-booking-window.ts`, `use-edit-booking-window.ts` - не рендерить `BookingPaymentSection` и не собирать `payment` при `!enabled`.

**features/edit-order**: не рендерить `SalePaymentField` и не слать `payment` при `!enabled`.

**features/edit-location-settings**: schema (`paymentTrackingMode: z.enum(PaymentTrackingMode)`), значения по умолчанию из локации, `formToUpdateLocationDto`, новый `ui/location-payment-tracking-field.tsx` (секция целиком), подключение в `location-settings-form.tsx`. После сохранения `useUpdateLocation` уже инвалидирует `locationKeys.lists()` - `usePaymentTracking` обновится. Дополнительно инвалидировать `paymentKeys.all()`, `calendarKeys.views()` и `bookingKeys.all()`: статусы `NOT_TRACKED` пересчитываются на сервере.

Инвалидации быстрой оплаты и отмены: как у `usePayBooking` (`refreshBookingSurfaces`: записи, календарь, заказы, `paymentKeys.all()`, дашборд, зарплата, аудит). Продажа: `orderKeys.all()`, `paymentKeys.all()`, аудит заказа.

Нельзя: вызывать axios из компонентов, хранить статус оплаты в Zustand, сравнивать статусы строками, дублировать `PaymentStateLine`/`useIdempotencyKey`/`mismatchAmountDue` (использовать существующие).

## 7. Тесты

### 7.1 Бэкенд, unit

- `payment-tracking.rules.spec.ts`: `MANUAL` до/ровно в/после `since`; `DISABLED` всегда `false`.
- `payment-state.rules.spec.ts`: `NOT_TRACKED` только при отсутствии записей и `due > 0`; `due = 0` -> `NOT_REQUIRED` при любом учёте; записи есть -> `PAID`/`UNDERPAID`/`OVERPAID` при `tracked = false`.
- `payment-tracking-switch.spec.ts`: таблица 2.4.
- `payment-expectations.rules.spec.ts`: `expectedAmount` равен/не равен `requiredAmount` (с возвратами), `expectNoPayment` с активной оплатой и без.
- `payment-undo.rules.spec.ts`: автор/не автор, 9:59/10:01 минут, `REFUND`, `replacesOperationId`, уже аннулирована.
- `payment-request-hash.spec.ts`: новые поля меняют hash.
- `finance-tracked-range.spec.ts`: `DISABLED` -> `null`, `since` внутри/до/после диапазона.

### 7.2 Бэкенд, интеграция (БД)

- Миграция: существующий филиал - `MANUAL`, `since` = момент миграции; новый филиал - момент создания.
- `PUT /locations/:id`: `DISABLED` -> `MANUAL` ставит `since = now`; `MANUAL` -> `MANUAL` не трогает; `paymentTrackingSince` в теле игнорируется; аудит `LOCATION_UPDATED` с `paymentTrackingMode`; кэш настроек сброшен (следующий `record` видит режим).
- Карточка записи: визит до `since` без записей -> `NOT_TRACKED`; с записью -> `PAID`; после `since` -> `NOT_SPECIFIED`; `DISABLED` -> `NOT_TRACKED`; `draftProductsCount`.
- Календарь: те же случаи в `paymentStatus`.
- Заказы: продажа до/после `since`; заказ визита берёт `startAt` визита, а не `occurredAt` заказа.
- Сводка: `DISABLED` -> пустой список, деньги считаются; `since` посреди периода -> только визиты/продажи после; `draftProductsCount` в элементах.
- Быстрая оплата `PUT bookings/:id/payment` с `expectedAmount` и `expectNoPayment`: успех завершает начавшийся визит; неверная сумма -> 409, визит не завершён, журнал пуст; оплата уже есть -> 409 `PAYMENT_ALREADY_RECORDED` с `operationId`; повтор того же ключа -> 200 тот же `operationId`; `expectedAmount` с `MIXED` -> 400; два параллельных запроса с разными ключами и `expectNoPayment` -> одна оплата, второй 409.
- `PAYMENT_TRACKING_DISABLED`: `PUT bookings/:id/payment`, `POST bookings/manual` с `payment` (запись не создана), `PUT bookings/:id` с `payment` (правка откатилась), `PUT orders/:id/payment`, `POST orders` с `payment`, `items/confirm` с `payment`.
- При `DISABLED` работают: возврат денег, аннулирование, возврат товара оплаченной продажи с `refund`, отмена.
- Отмена `POST bookings/:id/payment/undo`: автор-мастер с `booking.own:write` -> 200, записи аннулированы, аудит `PAYMENT_VOIDED` с причиной; статус визита остался `COMPLETED`; повтор -> 200; чужой автор -> 409; через 11 минут -> 409 `PAYMENT_UNDO_EXPIRED`; операция из другого заказа -> 404; мастер чужого визита -> 403; после возврата денег -> 409.

### 7.3 Фронтенд, браузер

Dev на 8083, crm-core с веткой фичи, тестовый филиал. Ширины 390, 768, 1280 (с открытым меню), 1440.

1. Филиал после миграции: в календаре нет кошельков на прошлых визитах, сводка без «Оплата не указана», карточки старых визитов без строки оплаты.
2. Визит сегодня, начался, CONFIRMED: поповер -> «Карта» -> тост «Визит завершён. Карта, 1 500 ₽», строка «Карта», статус «Завершена». «Отменить» -> «Оплата отменена», строка «Оплата не указана», статус остаётся «Завершена», снова видны кнопки.
3. Двойной клик по «Карта» - одна оплата. Быстро «Наличные», потом «Карта» - вторая кнопка недоступна во время запроса.
4. Сумма изменилась в другой вкладке (добавлен проданный товар) -> клик -> «Сумма изменилась: …», после перезагрузки клик проходит.
5. Визит с черновым товаром: у администратора «Оплатить» (окно), у мастера кнопки.
6. Будущий визит: только «Указать оплату». `NO_SHOW` с товаром - окно. `PAID`/`OVERPAID` - как раньше.
7. Мастер (`booking.own:write`): кнопки на своём визите, нет на чужом, «Отменить» работает; сводки нет.
8. Сводка: оплата строки визита и строки продажи в один клик, строка исчезает, счётчик уменьшается, «Отменить» возвращает строку. Период до начала учёта - «Оплаты отмечаются с …».
9. Страница записи и страница продажи: **БО**, «Другая оплата» открывает окно со смешанной оплатой.
10. Настройка «Не вести»: сохранить -> нет кнопки сводки, кошельков, строк, блока в окне записи, поля в новой продаже; оплаченный ранее визит показывает «Карта», отменённый оплаченный - «Переплата» и «Вернуть деньги»; возврат товара оплаченной продажи спрашивает «Как вернули деньги». Старая вкладка с открытым окном записи и выбранной оплатой -> сохранение -> «В филиале выключен учёт оплат».
11. Снова «Отмечать вручную»: подсказка про момент сохранения, после сохранения «Учёт с …», визиты до этого момента без «Оплата не указана».
12. Клавиатура: Tab доходит до «Наличные», «Карта», «Другая оплата», Enter платит; тост с «Отменить» доступен с клавиатуры.

Проверки: `yarn tsc:check`; бэкенд - `vitest` затронутых модулей и `typecheck`. Lint - только по просьбе.

## 8. Порядок работ

Бэкенд и фронтенд идут параллельно по разделу 3. Фронтенд до готовности бэкенда опирается на этот контракт и после - на сгенерированный `docs/openapi.json` (бэкенд кладёт копию в `crm-frontend/docs/openapi.json`). Расхождение - правка этого документа, затем кода.

Бэкенд: миграция и Location -> статус `NOT_TRACKED` во всех чтениях -> сводка -> ожидания оплаты -> запрет при `DISABLED` -> отмена -> OpenAPI.

Фронтенд: типы и `usePaymentTracking` -> скрытие при `DISABLED` и `NotTracked` -> правила и `QuickPayButtons` -> быстрая оплата в поповере и на странице -> отмена -> сводка -> продажа -> настройка -> `docs/AI_PLAN.md`.

## 9. Отклонённые варианты и проверки

### 9.1 Отклонено

- Backfill «оплачено» для истории: выдумывает способ оплаты и портит сверку.
- `NOT_REQUIRED` или `null` вместо `NOT_TRACKED`: см. 2.3.
- Только скрывать UI при «Не вести»: см. 3.5.
- Отмена через расширение `void` для автора: смешивает исправление любой операции и узкое право мастера.
- Откат завершения при отмене: потребовал бы отката начислений; визит уже начался.
- Оптимистичное обновление: оплата меняет статус визита, деньги сводки и заказ; ложный «оплачено» при ошибке хуже, чем полсекунды загрузки.
- Быстрые кнопки на будущих визитах: предоплата редкая и требует даты; клик по ошибке не на тот день будущей недели виден хуже.
- Быстрые кнопки прямо на карточке в сетке календаря: мелко для пальца, мешает перетаскиванию.

### 9.2 Права - сводка

| Действие | Право |
| --- | --- |
| Быстрая оплата визита | Как первая оплата: `booking:write` или `booking.own:write` своего визита |
| Отмена быстрой оплаты визита | То же + автор + 10 минут |
| Быстрая оплата продажи, её отмена | `order:write` |
| Настройка учёта | `location.settings:write` |
| Видеть сводку | `analytics.location:read` (без изменений) |

### 9.3 Крайние случаи

| Случай | Поведение |
| --- | --- |
| Визит через полночь, начался до `since` | По `startAt`: не учитывается |
| Визит перенесли с даты до `since` на дату после | Учитывается (статус считается при чтении) |
| Учёт выключили, потом включили через неделю | Неделя не учитывается, кошельков за неё нет |
| Учёт выключен, визит оплачен ранее, цена изменилась | `UNDERPAID`, строка видна, «Изменить» нет (запись запрещена). Поправить можно, включив учёт |
| Два администратора кликают одновременно по разным способам | Блокировка заказа сериализует, второй получает `PAYMENT_ALREADY_RECORDED` |
| Отмена после того, как другой администратор заменил оплату | Операция уже аннулирована заменой -> 200 без изменений; новая оплата другого администратора остаётся |
| Ответ быстрой оплаты потерян, пользователь кликнул ещё раз | Тот же ключ -> тот же результат, тост с «Отменить» |

### 9.4 Виджет

`klendo-widget` использует только публичные эндпоинты и `LocationPublicResponseDto`; они не меняются. `generated.ts` виджета содержит полную схему, но новых полей не читает. Изменений в виджете нет; перегенерация типов не обязательна.

## 10. Открытые вопросы (реализация идёт с ответом по умолчанию)

1. Давать ли менять дату начала учёта вручную («Учитывать с»)? По умолчанию: нет, только момент включения.
2. Окно отмены 10 минут и кнопка только в тосте 10 секунд? По умолчанию: да. Мастер, заметивший ошибку позже, просит администратора.
3. При отмене возвращать визит в «Подтверждена»? По умолчанию: нет, визит остаётся завершённым.
4. Показывать быстрые кнопки мастеру при черновых товарах (он не может их продать)? По умолчанию: да, как его текущее окно.
5. Какая кнопка выделена? По умолчанию: «Карта» (`contained`), «Наличные» (`outlined`), как выбор по умолчанию в окне.
6. Показывать ли кнопку сводки при «Не вести», если в журнале есть деньги за период? По умолчанию: нет.
7. Быстрая оплата `NO_SHOW` с проданными товарами? По умолчанию: нет, окно.
8. Давать ли «Указать оплату» на визитах до начала учёта? По умолчанию: да, тихое действие на поповере и странице записи; в календаре и сводке их нет.

## 11. Отличия реализации (бэкенд)

Форма API (поля, enum, коды, права) - по разделу 3, кроме добавленного поля `bookingStatus`.

- `FinanceNotSpecifiedItemDto.bookingStatus` (новое, по запросу фронтенда, см. 3.6): окно вместо кнопок для `NO_SHOW`/`CANCELLED` в сводке.
- Порядок проверок в `record`: `expectNoPayment` проверяется до права замены (3.3), иначе мастер получал бы 403 вместо 409 `PAYMENT_ALREADY_RECORDED`.
- Ожидания (`expectedAmount`, `expectNoPayment`) лежат в `PaymentRequest`, а не отдельными полями `PaymentCommand`: запрос строит одна чистая функция `paymentRequest` для записи и заказа.
- `LocationService.getPaymentTracking` читает режим из БД (один select), а не из кэша настроек (3.1): режим решает запись денег, устаревший кэш другой реплики не должен на это влиять. Поля учёта в `LOCATION_SETTINGS_SELECT` не добавлены.
- `PAYMENT_TRACKING_DISABLED` проверяется дважды: рано, до блокировок (`BookingPaymentService.plan`, `OrderPaymentService.prepareRequest`), и в `PaymentsFacade.record` как страховка.
- Платёжные методы заказов вынесены из `OrdersFacade` в `OrderPaymentsFacade` (`paymentViews`, `recordPayment`, `refund`, `voidPaymentOperation`, `undoVisitPayment`); его использует `OrdersController` и `BookingPaymentService.undo`.
- Первый шаг действия с ключом оплаты - один метод `PaymentsFacade`: `lockKeyForReplay` (блокировка ключа и повтор) или `lockUnusedKey` (оплата только что созданной записи).
- Отмена: `OrderPaymentsFacade.undoVisitPayment` -> `OrderPaymentCorrectionService` (туда же переехал `voidOperation`) -> `PaymentsFacade.undo` -> `PaymentLedgerService.undo`. Блокировки входа (`lockOrderWithVisit`, `lockVisitOrder`) - в `OrderLockService`. На заблокированной записи повторно проверяется, что мастер с `booking.own:write` ещё участвует в визите (403), как в оплате (`assertVisitParticipant`, им же пользуется `BookingPaymentService.pay`). Условия - чистые правила `orders/rules/order-payment-correction.rules.ts`, условия журнала - `payments/rules/payment-undo.rules.ts` и `payments/rules/payment-void.rules.ts`.
- `tracked` заказов считает `OrderPaymentTrackingService`: заказ визита - по `startAt` записи, в том числе удалённой (`BookingVisitsService.startAtByBookingIds`), как в сводке; `Order.occurredAt` - только если записи больше нет. Момент - чистая `orderPaymentMoment` (`orders/rules/order-payment-tracking.rules.ts`).
- Статус в календаре и в `PaymentSummaryDto` - одна функция `paymentStatusOf(amountDue, totals, tracked)` в `payments/rules/payment-state.rules.ts`.
- `docs/openapi.json` в `crm-core` не хранится (см. раздел 4).
