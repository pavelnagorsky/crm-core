# Цены и акции, этап 8: отчёты по скидкам и наценкам - контракт

Источник правды для бэкенда (crm-core) и кабинета (crm-frontend) на время этапа 8. Решения: [план](./pricing-plan.md),
раздел 7 «Решения этапа 8» (обязательны, здесь не пересматриваются). Макеты: Figma `MkKdfodEyjoE1UryUQ6PbC`, страница CRM,
секция «Цены и акции», подсекция 13 (node `1365:712`). Форматы - как в [контракте этапа 7](./pricing-stage7-api.md):
деньги в DTO - строки с двумя знаками, количество - строка с тремя знаками, моменты - ISO UTC, даты - `YYYY-MM-DD` в поясе
филиала. Имена полей ниже - договорённость; если существующий DTO уже называет то же самое иначе, остаётся существующее
имя, а этот файл правится.

Правило проекта: прода нет, совместимость не нужна. Изменения делаются целиком, без старых полей и флагов.

## Как считается одна позиция

Позиция - услуга записи (`BookingItem`) или строка товара (`OrderItem` с `type = PRODUCT`). Строки услуг в заказе
(`OrderItem` с `type = SERVICE`) в отчёт не входят: услуги считаются по `BookingItem`, иначе они посчитаются дважды.

Для каждой позиции четыре суммы, все неотрицательные, и всегда `regular + surcharges - discounts = received`:

| | Услуга записи | Строка товара |
|---|---|---|
| `regular` - обычная цена | `staffPrice` (база, уровень, личная цена) | `quantize(quantity × listUnitPrice)` |
| `surcharges` - наценки | `listPrice - staffPrice` + рост своей ценой | 0 + рост своей ценой |
| `discounts` - скидки | `listPrice - chargedPrice`, или снижение своей ценой | `listLineTotal - lineTotal`, или снижение своей ценой |
| `received` - получено | `customPrice ?? chargedPrice` | `lineTotal` за вычетом возвратов |

- Своя цена (`customPrice` / `customUnitPrice` задана) заменяет автоматическую скидку: скидок акций и скидки клиента у такой
  позиции нет (их слои, если остались в раскладке, не учитываются). `delta = received - listTotal`, где `listTotal` - цена
  по прайсу (`listPrice`, у товара `listLineTotal`). `delta < 0` - причина `CUSTOM_PRICE_DOWN` на `-delta` в скидках,
  `delta > 0` - `CUSTOM_PRICE_UP` на `delta` в наценках.
- Разбивка по причинам:
  - наценки - по слоям `SURCHARGE` (`ruleId`, `amount`); слой `ROUNDING` относится к ближайшему предыдущему слою
    (по `sortOrder`) и прибавляется к нему; если перед округлением нет слоя правила, округление относится к обычной цене;
  - скидка - один слой `PROMOTION` (причина `PROMOTION`, `ruleId`) или `CLIENT_DISCOUNT` (причина `CLIENT_DISCOUNT`);
    сумма причины = вся скидка позиции, вместе с её округлением;
  - сумма причин позиции всегда равна её `surcharges` и `discounts`. Если раскладка позиции не сходится с её ценами
    (старые записи до этапа 1), расхождение уходит в обычную цену, а не в причину.
- Возвраты товаров: `received`, `regular`, `surcharges`, `discounts` строки и суммы её причин уменьшаются на долю
  возвращённого количества (`returnedQuantity / quantity`, тем же `allocateCumulative`, что возврат), по всем проведённым
  возвратам на текущий момент. Полностью возвращённая строка в отчёт не входит.
- Мастер позиции: у услуги - `BookingItem.staffId`, у товара - `sellerStaffId`. Нет мастера - строка «Без мастера»
  (`staffId: null`).

## База отчёта

- Услуги: позиции записей филиала со статусом `CONFIRMED` или `COMPLETED`, у которых начало визита (`Booking.startAt`)
  в периоде и не позже текущего момента. Отменённые, неявки, ожидающие и будущие визиты не входят. Это те же статусы,
  что у выручки аналитики (`dashboard-widget.constants.ts`).
- Товары: строки `CONFIRMED` с `confirmedAt` в периоде, заказ `ACTIVE` (и товары визита, и отдельные продажи).
- «Записи» - различные записи с позицией в выборке; товары визита относятся к записи визита. «Продажи» - различные
  заказы без записи (отдельные продажи). «Клиенты» - различные клиенты записей и продаж; позиции без клиента не считаются
  в клиентах.
- Период - `DashboardRangeDto` и `DashboardRangeService.resolve` (как у аналитики филиала): тот же разбор `period`,
  `from`, `to`, `timezone`, тот же прошлый период и те же ошибки валидации.

## API

Все эндпоинты - в `PriceRulesController` (`locations/:locationId/price-rules`) или рядом с ним в модуле `pricing`, право
`Read(ANALYTICS_LOCATION)`. Считает новый сервис в `bookings` (услуги) и `orders` (товары) через их фасады, как отчёт
акции этапа 7; `pricing` только собирает ответ. Маршруты `analytics*` объявляются до `:ruleId`.

### Сводка - `GET price-rules/analytics`

Query: `DashboardRangeDto` (`period`, `from?`, `to?`, `compareWithPrevious?` по умолчанию `true`, `timezone?`).
`groupBy` игнорируется.

```ts
PriceAnalyticsResponseDto {
  period: { from: string; to: string };               // ISO UTC, to - исключительная граница (как meta.period аналитики)
  previousPeriod: { from: string; to: string } | null; // null, если compareWithPrevious = false
  currency: string;
  totals: PriceAnalyticsTotalsDto;
  previousTotals: PriceAnalyticsTotalsDto | null;      // за прошлый период, null без сравнения
  discounts: PriceAnalyticsReasonRowDto[];             // PROMOTION, CLIENT_DISCOUNT, CUSTOM_PRICE_DOWN
  surcharges: PriceAnalyticsReasonRowDto[];            // SURCHARGE, CUSTOM_PRICE_UP
  staff: PriceAnalyticsStaffRowDto[];
  discountsCounts: PriceAnalyticsCountsDto;            // без повторов по всем позициям со скидкой (строка «Итого» вкладки)
  surchargesCounts: PriceAnalyticsCountsDto;           // то же для наценок
}

PriceAnalyticsCountsDto { itemsCount: number; bookingsCount: number; salesCount: number; clientsCount: number }

PriceAnalyticsTotalsDto {
  regular: string; surcharges: string; discounts: string; received: string;
  listTotal: string;          // regular + surcharges, «цена по прайсу»; доля скидок = discounts / listTotal
  itemsCount: number; bookingsCount: number; salesCount: number; clientsCount: number;
}

enum PriceChangeReason { PROMOTION, SURCHARGE, CLIENT_DISCOUNT, CUSTOM_PRICE_DOWN, CUSTOM_PRICE_UP }

PriceAnalyticsReasonRowDto {
  reason: PriceChangeReason;
  name: string | null;         // имя правила (у удалённого - title слоя); null у CLIENT_DISCOUNT и CUSTOM_*
  rule: {                      // только PROMOTION и SURCHARGE
    id: string; name: string; kind: PriceRuleKind; scenario: PromotionScenario | null;
    valueType: PriceValueType; value: string; promoCode: string | null; archived: boolean;
  } | null;
  bookingsCount: number; salesCount: number; clientsCount: number; itemsCount: number;
  amount: string;              // положительная сумма скидки или наценки
  sharePct: number;            // доля в своей группе (скидки или наценки), 0-100, один знак после запятой
}

PriceAnalyticsStaffRowDto {
  staffId: string | null; name: string | null; avatarUrl: string | null;   // name null - «Без мастера»
  bookingsCount: number; salesCount: number;
  regular: string; surcharges: string; discounts: string;
  customDiscounts: string;     // часть discounts: CUSTOM_PRICE_DOWN
  received: string;
}
```

- Строки с нулевой суммой не возвращаются. Сортировка причин - по `amount` по убыванию, затем по имени; мастеров - по
  `received` по убыванию. Правило, удалённое из БД (`ruleId` очищен), попадает в строку с `rule: null` и причиной
  `PROMOTION` или `SURCHARGE`; имя - из `title` слоя.
- Итог по `sharePct` в группе может отличаться от 100 из-за округления, это допустимо.
- Пустой период - нули в `totals`, пустые массивы.

### Позиции - `GET price-rules/analytics/items`

Query: `DashboardRangeDto` (без сравнения; `compareWithPrevious` игнорируется) + `PaginationRequestDto`
(`page`, `pageSize` по умолчанию 25, максимум как у остальных списков) +

- `reason?: PriceChangeReason`, `ruleId?: uuid` (только вместе с `reason` = `PROMOTION` или `SURCHARGE`;
  иначе 400 `PRICE_ANALYTICS_FILTER_INVALID`);
- `staffId?: uuid | 'none'` (`none` - без мастера);
- `itemType?: SERVICE | PRODUCT`.

В список входят только позиции, у которых есть хотя бы одна причина (наценка, скидка или своя цена). С фильтром `reason`
- позиции с этой причиной (у позиции видны и другие её изменения). Сортировка - по `at` по убыванию, затем по id.

```ts
PriceAnalyticsItemsResponseDto extends PaginationResponseDto {
  items: PriceAnalyticsItemDto[];
  summary: PriceAnalyticsTotalsDto;   // по всем позициям фильтра, не по странице
  currency: string;
}

PriceAnalyticsItemDto {
  id: string;                          // bookingItemId или orderItemId
  source: 'BOOKING' | 'SALE';          // SALE - отдельная продажа; товар визита - BOOKING
  bookingId: string | null; orderId: string | null;
  at: string;                          // начало визита или confirmedAt, ISO UTC
  itemType: 'SERVICE' | 'PRODUCT';
  title: string;                       // название услуги или товара на момент позиции
  quantity: string | null;             // товары
  client: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;   // мастер или продавец
  regular: string; surcharges: string; discounts: string; received: string;
  returned: boolean;                   // у строки товара есть частичный возврат (суммы уже за вычетом)
  changes: {
    reason: PriceChangeReason; ruleId: string | null; name: string;
    valueType: PriceValueType | null; value: string | null;   // из слоя правила или скидки клиента; у CUSTOM_* - null
    amount: string;                    // со знаком: наценка +, скидка -
  }[];                                 // в порядке применения: наценки, затем скидка или своя цена
}
```

### Выгрузка - `GET price-rules/analytics/items/export`

Те же фильтры без пагинации, xlsx тем же способом, что выгрузка «Не вернулись» (`Content-Disposition`, имя файла
`skidki-i-natsenki-<from>-<to>.xlsx`). Лист «Позиции», колонки: «Дата», «Время», «Запись или продажа», «Клиент»,
«Мастер или продавец», «Позиция», «Тип» (услуга, товар), «Количество», «Обычная цена», «Наценки», «Скидки», «Итог»,
«Что изменило цену» (через «; »: `Выходные +15% +6,00; Осенний промокод −15% −6,90`). Последняя строка - «Итого» по суммам.
Даты и время - в поясе филиала. Телефонов в выгрузке нет. Предел - 50 000 строк, больше - 400 `PRICE_ANALYTICS_EXPORT_TOO_LARGE`
с `{ limit }`.

### Страница акции - `GET price-rules/:ruleId/report`

- База услуг меняется на базу этого контракта: записи `CONFIRMED` и `COMPLETED`, визит начался (было: все, кроме
  отменённых). `notReturned` и `returnedRate` - как раньше, но кандидаты - визиты по акции из этой же базы.
- Период отчёта считается через `DashboardRangeService` в поясе филиала: `30d` - как `LAST_30D`, `90d` - `CUSTOM` с сегодняшнего
  дня минус 89 по сегодня, `all` - с даты создания правила по сегодня. Новое поле `period: { from: string; to: string }` -
  календарные даты `YYYY-MM-DD` включительно (кнопка «Все позиции» передаёт их как `CUSTOM`).
- Новое поле `previous: PromotionReportPreviousDto | null`: для `30d` и `90d` - те же показатели за предыдущие 30 или 90 дней
  перед периодом, для `all` - `null`.

```ts
PromotionReportPreviousDto {
  revenue: string; discount: string; bookingsCount: number; salesCount: number; clientsCount: number;
  returnedRate: number | null;         // как returnedRate, но среди визитов прошлого периода
}
```

### Зарплата: база процента

- Миграция: `enum CommissionBase { CHARGED, LIST }`, `StaffCompensationPlan.commissionBase CommissionBase @default(CHARGED)`.
- DTO создания и ответа схемы оплаты + `commissionBase: CommissionBase` (в создании необязательно, по умолчанию
  `CHARGED`). Действует для процента с услуг (включая свои проценты по услугам) и процента с товаров.
- База процента позиции:
  - `CHARGED` - как сейчас: услуга `customPrice ?? chargedPrice`, товар - итог строки;
  - `LIST` - цена по прайсу: услуга `max(listPrice, customPrice ?? chargedPrice)`, товар `max(listLineTotal, lineTotal)`;
    возврат товара сторнирует комиссию с той же долей базы.
- Схема берётся по дате начисления, как сейчас. Уже начисленное не пересчитывается.

## Кабинет (crm-frontend)

- `entities/price-rule`: API и хуки `usePriceAnalytics(locationId, range)`, `usePriceAnalyticsItems(locationId, params)`,
  `useExportPriceAnalyticsItems`; ключи `priceRuleKeys.analytics(...)`, `priceRuleKeys.analyticsItems(...)`.
  `invalidatePriceEffects` и мутации записей, продаж и возвратов, которые уже сбрасывают аналитику, сбрасывают и эти ключи.
- Страница «Аналитика»: блок «Скидки и наценки» последним, тот же период и переключатель «С прошлым периодом», формула,
  вкладки «Скидки», «Наценки», «По мастерам», кнопка «Все позиции». Подпись строки правила - вид и значение
  («Акция · счастливые часы · −15%», «Наценка · +15%», промокод - «Акция · промокод OSEN15 · −15%»), архивное правило -
  «в архиве». Строка открывает «Все позиции» с фильтром. Якорь блока - для ссылки из «Цен и акций».
- Новая страница «Все позиции»: `paths.dashboard.location(id).analyticsPriceItems` (`/analytics/prices`), метаданные,
  фильтры в адресе (`period`, `from`, `to`, `reason`, `ruleId`, `staffId`, `itemType`, `page`), выгрузка, строка открывает
  запись или продажу. Пункт меню не добавляется.
- «Цены и акции», вкладки «Акции» и «Наценки»: ссылка «Отчёт по скидкам и наценкам» к блоку на «Аналитике».
- Страница акции: изменение к прошлому периоду под показателями (`previous`), кнопка «Все позиции»: фильтр по акции,
  `period=CUSTOM` с `from`/`to` из `period` отчёта.
- Схема оплаты: блок «Процент считать от» (два варианта с пояснением и примером), строка «Процент от» в карточке схемы.
- Права: блок и страница видны с `analytics.location` на чтение, как остальная аналитика.

## Уточнения реализации

### Зарплата и страница акции

Зарплата, база процента:

- Миграция `20261130130000_pricing_commission_base`. Поле `commissionBase` есть в запросе замены схемы
  (`PUT` схемы оплаты, необязательное, по умолчанию `CHARGED`; не наследуется от предыдущей версии схемы, как и проценты)
  и в ответе (`CompensationPlanResponseDto.commissionBase`). В аудите `STAFF_COMPENSATION_UPDATED` в payload добавлено
  `commissionBase`.
- Услуга: база `max(listPrice, customPrice ?? chargedPrice)` при `LIST`, `customPrice ?? chargedPrice` при `CHARGED`.
  Пересчёт цены завершённой записи (`syncForCompletedBooking`) считает поправку от той же базы, что начисление.
- Товар: строка продажи теперь несёт `listAmount = quantize(quantity x listUnitPrice)` (`ProductOrderCommissionLine`);
  база `max(listAmount, amount)` при `LIST`. В начислении `baseAmount` - выбранная база, поэтому возврат и отмена продажи
  работают от неё.
- Возврат товара при `LIST`: проводки возврата берут ту же долю базы начисления, что возврат берёт от строки
  (`MoneyUtils.allocateCumulative` по количеству, как `allocateReturn`), а не `lineTotal` возврата. Если база начисления
  равна `lineTotal` строки (схема `CHARGED` или цена по прайсу не выше), берётся `lineTotal` возврата, как раньше.
  Для этого `reverseForProductOrderItemAmount` получил последний необязательный аргумент `returnShare`.
- Ручная продажа товара (`recordProductSale`, сумма приходит снаружи) базу не меняет: прайса у неё нет.

Страница акции:

- Услуги: `Booking.startAt` в периоде и не позже текущего момента, статус `CONFIRMED` или `COMPLETED`. Раньше фильтр шёл по
  `BookingItem.startAt`; теперь по началу визита, как в контракте. Клиенты, записи и доля вернувшихся считаются от той же базы
  (`PromotionProductStatsService.bookingClientIds` тоже).
- `notReturned` и `returnedRate`: кандидат - любой клиент с визитом акции из базы не позже чем за 14 дней до текущего момента;
  требование статуса `COMPLETED` снято (визит `CONFIRMED`, который уже начался, тоже кандидат). Выгрузка «Не вернулись» берёт
  ту же базу.
- Период собирает `PromotionReportService` (`pricing/services`): `30d` - `LAST_30D`, `90d` - `CUSTOM` с `сегодня - 89` по
  сегодня, `all` - с даты создания правила (в поясе филиала) по сегодня, всё через `DashboardRangeService` в поясе филиала.
  Ответ: `period: { from, to }` - календарные даты `YYYY-MM-DD` включительно.
- `previous` (`PromotionReportPreviousDto`: `revenue`, `discount`, `bookingsCount`, `salesCount`, `clientsCount`,
  `returnedRate`) - окно `[previousFrom, previousTo)` из `DashboardRangeService` (та же длина в миллисекундах, как у
  аналитики); для `all` - `null`. «Не вернулись» прошлого периода считается от текущего момента, не от конца окна: через
  14 дней после визита клиент уже мог записаться снова.
- Позиция со своей ценой (`customPrice` задан) не считается визитом акции: у неё нет автоматической скидки (контракт
  «Как считается одна позиция»). Страница пропускает такие позиции для выручки, скидки, записей, клиентов, мастеров и
  «Не вернулись» (и в выгрузке «Не вернулись»); так же `periodTotals` и `ruleStats` для акций.
- Скидка позиции на странице и в сводках - `listPrice - chargedPrice` целиком, вместе с округлением, как сумма причины
  `PROMOTION` в аналитике; считается один раз на позицию, даже если у неё несколько слоёв акции. Выручка - `chargedPrice`.
  У наценок в `ruleStats` остаётся сумма слоёв `SURCHARGE` без следующего за ними слоя `ROUNDING` (разница в копейки,
  переносить причину наценки на позицию там слишком инвазивно).
- `BookingPromotionReportService.report(locationId, ruleId, since, until)`: четвёртый аргумент - верхняя граница визитов
  (раньше `now`); срок «14 дней» отсчитывается от текущих часов сервиса. Фасад `BookingsFacade.getPromotionReport`
  не менялся.
- Сводка списка акций (`periodTotals`) и статистика правил за 30 дней (`ruleStats`) переведены на базу отчёта, чтобы
  цифры списка, страницы акции и отчёта совпадали. На прежней базе (не отменённые) остались то, что считает занятость
  лимитов и совпадения: счётчик использований (`usageCounts`) и превью акции (`matchItems`).

### Сводка и позиции

- Раскладка позиции, когда слои не сходятся с ценами (записи до этапа 1): причины наценок берутся из слоёв `SURCHARGE`
  с положительной суммой (с их округлением), если их сумма не больше `listPrice`; скидка без своей цены целиком
  относится к единственному слою `PROMOTION` или `CLIENT_DISCOUNT`; несколько слоёв скидки (старые раскладки)
  сохраняются, только если в сумме дают ровно скидку позиции, иначе причины скидки нет. Обычная цена всегда
  `received - surcharges + discounts`, расхождение уходит в неё. Если обычная цена при этом стала бы отрицательной
  (необъяснённая скидка больше наценок), причины наценок тоже отбрасываются.
- Возвраты товаров: `received` и наценки (включая `CUSTOM_PRICE_UP`) уменьшаются через `allocateCumulative` (half-up),
  скидки и `CUSTOM_PRICE_DOWN` - через `allocateCumulativeDown`, как `allocateReturn` распределяет `lineTotal` и
  `discountTotal`. Обычная цена - остаток по формуле, поэтому может отличаться от доли `listLineTotal` на копейку
  (0,750 кг, возврат 0,250: обычная 25,01 вместо 25,00). Причина, ставшая 0 после возврата, не показывается.
- `changes[].name` у правил - текущее имя правила (как в строках сводки), у удалённого правила - `title` слоя,
  у `CLIENT_DISCOUNT` - `title` слоя («Скидка клиента»), у `CUSTOM_*` - «Своя цена». `staff.name` в позициях и строках
  мастеров - текущее имя мастера, у удалённого из филиала - имя на момент позиции. `client` - `null`, если у записи или
  продажи нет `clientId` (даже если имя в записи есть).
- Сортировка строк причин при равной сумме - по `name`, у строк без имени (`CLIENT_DISCOUNT`, `CUSTOM_*`) - по подписи
  причины. Строки удалённых правил группируются по причине и `title` слоя; фильтр «Все позиции» для них - только
  `reason` (без `ruleId`).
- `staffId` в позициях: `uuid` или `none`; у услуги мастер есть всегда, поэтому `none` даёт только товары без продавца.
  `pageSize` по умолчанию 25, максимум 100 (больше или меньше 1 - 400 валидации, как у других DTO); `orderBy`,
  `orderDirection`, `isExport` в позициях игнорируются.
- `ruleId` без `reason` или с `reason`, отличной от `PROMOTION`/`SURCHARGE`, - 400 `PRICE_ANALYTICS_FILTER_INVALID`
  (проверяется до разбора периода).
- Выгрузка: «Запись или продажа» - «Запись» (услуга или товар визита) или «Продажа»; «Тип» - «Услуга» или «Товар»;
  «Количество» пусто у услуг; суммы - числа; минус в «Что изменило цену» - знак `−` (U+2212), как в примере контракта.
  Имя файла: `skidki-i-natsenki-<первый день>-<последний день>.xlsx`, даты включительно в поясе периода.
- Сравнение `previousTotals` - тот же расчёт за `previousFrom..previousTo` из `DashboardRangeService`; визиты прошлого
  периода тоже ограничены «не позже текущего момента».
- `discountsCounts` и `surchargesCounts` (`PriceAnalyticsCountsDto`: `itemsCount`, `bookingsCount`, `salesCount`,
  `clientsCount`) - различные счётчики по всем позициям периода, у которых есть хотя бы одна причина скидки (`PROMOTION`,
  `CLIENT_DISCOUNT`, `CUSTOM_PRICE_DOWN`) или наценки (`SURCHARGE`, `CUSTOM_PRICE_UP`). Правила те же, что у `totals`:
  товар визита считается в записи, продажа - заказ без записи, позиции без клиента в клиентах не считаются. Позиция с
  причинами обеих групп входит в оба счётчика. Это строка «Итого» вкладки: сумма строк причин дала бы повторы.
- Выгрузка и производительность: перед загрузкой выгрузка считает кандидатов тем же SQL `where` (`count` у загрузчиков
  записей и заказов, фасады `countPriceAnalyticsCandidates`) и сразу отвечает 400 `PRICE_ANALYTICS_EXPORT_TOO_LARGE`, если
  их больше 100 000 (двойной предел: часть кандидатов отпадает после расчёта причин и возвратов). Точная проверка
  «больше 50 000 позиций» после расчёта осталась. Список позиций страницами всё равно считает период целиком (сводка
  по фильтру и сортировка), поэтому у него максимум страницы 100.
- Индексы: у `Booking` уже есть `(locationId, deletedAt, startAt)`, новая миграция не нужна. Загрузчик услуг теперь
  фильтрует `booking.locationId` вместе с `deletedAt` и `startAt`, чтобы запрос шёл по этому индексу. Строки товаров
  идут от `Order (locationId, status)` к `OrderItem (orderId)`.
- Товары записи, удалённой в корзину (`Booking.deletedAt` задан), в отчёт не входят: тот же признак, что у `usageCounts`
  (`bookingId` пуст или у записи нет `deletedAt`). То же условие стоит у товарной части страницы акции, сводки списка и
  статистики за 30 дней (`PromotionProductStatsService`), чтобы страница и аналитика сходились.
