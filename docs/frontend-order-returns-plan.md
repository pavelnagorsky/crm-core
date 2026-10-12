# Frontend plan: product returns and repeated product additions

Oct 12, 2026 - frontend implementation notes

## Зачем это нужно

У нас появился нормальный backend-flow для двух кассовых сценариев:

1. Продан товар, и в заказ нужно добавить такой же товар ещё раз.
2. Продан товар количеством больше 1, и клиент возвращает только часть, например 3 из 5.

Раньше это было неудобно для фронта и опасно для данных. Повторный товар мог конфликтовать с уже существующей строкой, а частичный возврат нельзя было выразить явно. Главное правило после изменений: продажа и возврат - разные бизнес-события. Исходная строка продажи не переписывается задним числом; возврат создаётся отдельным документом.

Это важно для аудита, склада и комиссий:

- исходная продажа остаётся как факт продажи;
- возврат фиксируется отдельной операцией с причиной и idempotency key;
- склад получает отдельное движение возврата;
- комиссия сотрудника корректируется только на возвращённую сумму;
- totals заказа считаются как продажи минус posted-возвраты.

## Что изменилось на backend

### 1. Повторное добавление товара

Если в заказе уже есть `PRODUCT/DRAFT` с тем же товаром, новое добавление такого же товара теперь не создаёт дубль, а увеличивает quantity существующей draft-строки.

Если такой же товар уже есть как `PRODUCT/CONFIRMED`, это не блокирует добавление. Backend создаёт новую `PRODUCT/DRAFT` строку, потому что confirmed sale-line уже является фактом продажи.

Для фронта это означает:

- не нужно вручную запрещать "тот же товар" глобально по всему заказу;
- можно запрещать дубликаты только внутри одного локального payload, если UI собирает batch;
- после `POST /orders/:orderId/items` всегда заменять локальный order state на response от backend.

### 2. Частичный возврат товара

Добавлен отдельный endpoint:

```text
POST /locations/:locationId/orders/:orderId/returns
```

Он принимает явный список возвращаемых order items и quantities. Это основной вход для partial returns.

Старый endpoint:

```text
PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/reverse
```

остаётся full reverse action. Если до него уже были частичные возвраты, он реверсит только оставшийся невозвращённый остаток и помечает строку `REVERSED`.

## Новый контракт возврата

Request:

```ts
type CreateOrderReturnRequest = {
  idempotencyKey: string;
  reason: string;
  occurredAt?: string;
  items: Array<{
    orderItemId: string;
    quantity: string;
  }>;
};
```

Response:

```ts
BaseResponseDto<OrderResponseDto>
```

Backend возвращает обновлённый заказ целиком. Фронт должен заменить локальный order state на response, а не пересчитывать totals вручную.

Пример:

```json
{
  "idempotencyKey": "return-9f6b0a7a-2b65-4a24-ae5a-9d3f3c0f8a1c",
  "reason": "Client returned part of the purchase",
  "items": [
    {
      "orderItemId": "order-item-1",
      "quantity": "3.000"
    }
  ]
}
```

## Новые поля в OrderItemResponse

В `OrderItemResponseDto` появились поля:

```ts
type OrderItemResponse = {
  quantity: string;
  returnedQuantity: string;
  returnableQuantity: string;
};
```

Смысл:

- `quantity` - исходно проданное количество по строке;
- `returnedQuantity` - сколько уже возвращено posted-возвратами;
- `returnableQuantity` - сколько ещё можно вернуть.

Для `PRODUCT/CONFIRMED` фронт должен использовать `returnableQuantity` как максимум в форме возврата. Для `DRAFT`, `REVERSED`, `SERVICE` возврат через новый endpoint недоступен.

## UI-модель

### Секции строки заказа

| Строка | UI |
| --- | --- |
| `PRODUCT/DRAFT` | editable: товар, quantity, price, seller |
| `PRODUCT/CONFIRMED`, `returnableQuantity > 0` | read-only sale line + action "Return" |
| `PRODUCT/CONFIRMED`, `returnableQuantity = 0` | read-only fully returned line |
| `PRODUCT/REVERSED` | read-only reversed line |
| `SERVICE/*` | read-only service line |

Не смешивать возврат с `PUT /orders/:id`. Возврат - отдельное действие.

### Partial return dialog

Для `PRODUCT/CONFIRMED` с `returnableQuantity > 0`:

1. Пользователь нажимает "Return".
2. UI открывает форму:
   - quantity, default можно `returnableQuantity`;
   - max = `returnableQuantity`;
   - reason, обязательный;
   - idempotencyKey генерируется на попытку submit.
3. UI отправляет `POST /orders/:orderId/returns`.
4. На успех заменяет order state на response.
5. На ошибку показывает понятное сообщение и не меняет локальные totals.

Если пользователь хочет вернуть 3 из 5, frontend обязан отправить `"quantity": "3.000"` явно. Не отправлять null/undefined и не пытаться выразить partial return старым `reverse` endpoint.

### Full return

Для полного возврата можно использовать новый returns endpoint с `quantity = returnableQuantity`. Это предпочтительный UI путь, потому что он одинаково работает для full и partial return.

Старый `reverse` endpoint можно оставить только для legacy-кнопки "reverse whole remaining item", если она уже есть. Новый UI лучше строить вокруг `POST /returns`.

## Idempotency

`idempotencyKey` обязателен для возврата. Фронт должен генерировать новый ключ на каждую пользовательскую попытку создать возврат.

Правило:

- retry того же HTTP-запроса использует тот же `idempotencyKey`;
- новая попытка пользователя после изменения quantity/reason использует новый `idempotencyKey`;
- не переиспользовать ключ между разными заказами или разными return dialogs.

Backend сравнивает request hash. Если тот же ключ пришёл с другим содержимым, вернётся `ORDER_IDEMPOTENCY_CONFLICT`.

## Ошибки и UX

| Error code | Когда бывает | UX |
| --- | --- | --- |
| `ORDER_RETURN_QUANTITY_EXCEEDS_REMAINING` | quantity больше `returnableQuantity` или остаток уже изменился | обновить заказ, показать "Доступное количество изменилось" |
| `ORDER_QUANTITY_INVALID` | quantity <= 0 или невалидное значение | подсветить поле quantity |
| `ORDER_ITEM_NOT_FOUND` | строка заказа не найдена | обновить заказ; если повторяется, закрыть dialog |
| `ORDER_STATUS_INVALID` | пытаемся вернуть draft/service/reversed item | обновить заказ; скрыть action |
| `ORDER_NOT_ACTIVE` | заказ уже не active | перевести экран в read-only |
| `ORDER_FUTURE_DATE` | occurredAt в будущем | подсветить дату, если UI её даёт |
| `ORDER_IDEMPOTENCY_CONFLICT` | тот же idempotencyKey использован для другого payload | сгенерировать новый ключ только после явного нового submit |

## Totals

Backend теперь считает totals заказа с учётом posted returns. Фронт не должен локально вычитать возврат из totals.

После возврата:

1. взять `OrderResponseDto` из ответа;
2. заменить order в store;
3. перерисовать totals, `returnedQuantity`, `returnableQuantity`.

## Что не делать на фронте

1. Не менять `quantity` исходной confirmed sale line локально после возврата.
2. Не отправлять returned item в `PUT /orders/:id`.
3. Не считать `productId` уникальным ключом строки в UI. Для существующих строк ключ - `OrderItem.id`.
4. Не блокировать добавление товара только потому, что такой товар уже есть confirmed.
5. Не использовать старый `reverse` endpoint для partial return.
6. Не пересчитывать order totals вручную.

## Migration plan

1. Обновить generated API types после нового OpenAPI.
2. Добавить в UI модель `returnedQuantity` и `returnableQuantity`.
3. Разрешить добавление товара, если совпадение есть только в confirmed/reversed строках.
4. Для existing `PRODUCT/DRAFT` с тем же товаром ожидать merge quantity от backend.
5. Добавить return action для `PRODUCT/CONFIRMED` при `returnableQuantity > 0`.
6. Сделать return dialog с явным quantity и reason.
7. Для submit генерировать `idempotencyKey`.
8. После success всегда заменять order state на backend response.
9. Обработать ошибки из таблицы выше.
10. Добавить UI regression tests на partial return 3 из 5, full return remaining, повторное добавление такого же товара.

## QA checklist

1. Продали `Shampoo x5`, вернули `x3`: строка остаётся `CONFIRMED`, `returnedQuantity = 3.000`, `returnableQuantity = 2.000`.
2. После этого вернули ещё `x2`: `returnableQuantity = 0.000`, action возврата скрыта/disabled.
3. Попытка вернуть `x6` для продажи `x5` показывает ошибку и обновляет order.
4. Повторный retry того же return request не создаёт второй возврат.
5. Тот же `idempotencyKey` с другим quantity даёт idempotency conflict.
6. Добавление товара, который уже есть `PRODUCT/DRAFT`, увеличивает quantity draft-строки.
7. Добавление товара, который уже есть только `PRODUCT/CONFIRMED`, создаёт новую draft-строку.
8. Возврат не меняет исходную `quantity` sale-line в UI.
9. Totals после возврата совпадают с backend response.
10. `PUT /orders/:id` не содержит confirmed/reversed/service rows.
