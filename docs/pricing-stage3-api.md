# Цены и акции, этап 3: контракт

Источник правды для бэкенда, кабинета, публичной страницы и виджета на время этапа 3.
Решения: [план](./pricing-plan.md), разделы 2.1, 2.4, 2.5, 2.7, 7 («Решения этапа 3»). Деньги в DTO - строки
с двумя знаками (`ApiPrice`), проценты - строки с двумя знаками (`"20.00"`), даты - `YYYY-MM-DD`,
время дня - `HH:mm` (`24:00` допустимо как конец интервала). Всё время - в поясе филиала.

## Решения этапа

- Наценка - `PriceRule` с `kind = SURCHARGE`. Поля акций добавит этап 4 той же таблицей.
- Тип расписания `scheduleType`:
  - `WEEKLY` («Дни и часы»): дни недели обязательны, период `visitFrom`/`visitTo` необязателен;
  - `SEASON` («Сезон»): `visitFrom` и `visitTo` обязательны; `yearly` - сравниваются месяц и день, диапазон может
    переходить через Новый год (15.12-10.01); без `yearly` `visitFrom <= visitTo`;
  - `HOLIDAYS` («Праздники»): список дат (1-100), `yearly`, `holidayExclusive`. 29 февраля с `yearly` действует
    только в високосные годы.
- У всех типов: дни недели (`weekdays`, ISO 1-7; у `SEASON` и `HOLIDAYS` пусто = все) и интервалы
  (`intervals`, пусто = весь день). Минута начала визита `m` попадает в интервал, если `start <= m < end`;
  интервалы одного правила не пересекаются, `start < end`.
- Правило смотрит на локальную дату, день недели и минуту **начала визита** (самая ранняя позиция записи)
  и действует на все позиции визита.
- К чему применяется: `appliesToAll` с исключениями (`excluded = true`) или список целей. Цели: `SERVICE`,
  `SERVICE_CATEGORY`, `BUNDLE`. Позиция обычной услуги подходит по услуге или её категории, позиция
  комплекса SUM - ещё и по `BUNDLE` (цель или исключение). Комплекс FIXED - пакет: подходит только по `BUNDLE` или `appliesToAll` (и не исключён), услуги
  и категории внутри него не смотрятся.
- Сочетание: все подходящие наценки складываются, каждая от цены мастера (FIXED - от цены комплекса). Если среди
  подходящих есть праздничная с `holidayExclusive`, действуют только такие (сохранить две на одну дату нельзя).
  `PERCENT`: `round_half_up(staffPrice × value / 100)` до копейки; `AMOUNT`: `value`.
- Округление: `Location.priceRoundingStep` (`0.01` = нет, `0.10`, `0.50`, `1.00` (по умолчанию), `5.00`, `10.00`).
  Если наценки изменили цену, `listPrice = round_nearest_half_up(staffPrice + сумма, step)`; разница - отдельная
  корректировка `ROUNDING` (новое значение `PriceAdjustmentKind`), раскладка всегда сходится с итогом. Без наценок
  цена не округляется. Цена не ниже 0. FIXED: округляется цена комплекса, затем распределяется по позициям как
  сейчас. Скидки (этап 4) будут округляться вниз.
- `customPrice` не округляется и наценками не меняется.
- Созданные записи правки правил не трогают; перенос не пересчитывает (этап 5).

## Ядро (`pricing/engine`)

```
PricingSnapshot + rules: PricingRuleEntry[]; roundingStep: number (minor); services[].categoryId: string | null
PricingRuleEntry {
  id, name, scheduleType, enabled: boolean,
  valueType: PERCENT | AMOUNT, value: number          // basis points | minor units
  visitFrom: string | null, visitTo: string | null,  // YYYY-MM-DD
  yearly: boolean, holidayExclusive: boolean,
  weekdaysMask: number,                               // bit (isoWeekday - 1); 0 = все дни
  intervals: { start: number; end: number }[],        // минуты 0-1440, пусто = весь день
  dates: string[],                                    // HOLIDAYS
  appliesToAll: boolean,
  targets: { type: SERVICE | SERVICE_CATEGORY | BUNDLE; id: string; excluded: boolean }[],
  createdAt: string                                   // порядок показа
}
QuoteRequest + visit: { date: string; minute: number } | null    // null - без наценок
PriceAdjustmentKind + ROUNDING
```

Методы `PriceBook` (чистые, без часов):
- `quote(request)` - слои с наценками и округлением.
- `priceRange(serviceId | bundle, staffId | null, dates: string[])` -> `{ min, max }`: по каждой дате берёт
  точки излома (границы интервалов подходящих правил) и считает цену в начале каждого отрезка суток.
  Занятость и смены не учитываются.
- `daySegments(request без visit, date)` -> `[{ startMinute, endMinute, quote }]` - отрезки суток с одной ценой
  (карта недели).
- `explain(request)` -> `quote` + `notApplied: [{ ruleId, name, reason }]`, `reason`:
  `DISABLED`, `OUT_OF_PERIOD`, `WRONG_WEEKDAY`, `OUT_OF_INTERVAL`, `NOT_HOLIDAY_DATE`, `NOT_TARGETED`,
  `EXCLUDED`, `OVERRIDDEN_BY_HOLIDAY`. Порядок проверки - как в списке.

## Данные (миграция `pricing_surcharges`)

```
enum PriceRuleKind      SURCHARGE
enum PriceScheduleType  WEEKLY | SEASON | HOLIDAYS
enum PriceRuleTargetType SERVICE | SERVICE_CATEGORY | BUNDLE
enum PriceAdjustmentKind + ROUNDING

Location.priceRoundingStep  Decimal(10,2) default 1.00

PriceRule        id, locationId, kind, scheduleType, name VarChar(100), note VarChar(500)?, enabled default true,
                 archivedAt?, valueType, value Decimal(10,2), visitFrom Date?, visitTo Date?, yearly, holidayExclusive,
                 weekdaysMask Int default 0, appliesToAll, createdById?, createdAt, updatedAt
                 @@index([locationId, archivedAt])
PriceRuleTarget  ruleId, targetType, targetId, excluded    @@id([ruleId, targetType, targetId]) @@index([targetType, targetId])
PriceRuleInterval ruleId, startMinute, endMinute           @@id([ruleId, startMinute])
PriceRuleDate    ruleId, date Date                          @@id([ruleId, date])
BookingItemPriceAdjustment.ruleId -> PriceRule (onDelete: SetNull)
```

- CHECK: `value > 0`; `0 <= startMinute < endMinute <= 1440`.
- Удаление услуги, категории, комплекса удаляет цели (сервис правил чистит `PriceRuleTarget` в той же операции,
  внешних ключей на цели нет - тип цели полиморфный). Правило остаётся.
- Аудит: `AuditEntity.PRICE_RULE`; события `PRICE_RULE_CREATED`, `PRICE_RULE_UPDATED`, `PRICE_RULE_ENABLED`,
  `PRICE_RULE_DISABLED`, `PRICE_RULE_ARCHIVED`, `PRICE_RULE_RESTORED`, `LEVEL_PRICES_FILLED` (сущность
  `PRICE_LEVEL`), `PRICE_ROUNDING_UPDATED` (сущность `LOCATION`).
- Снимок цен: правила (не архивные, включая выключенные - для «Не сработали»), шаг округления, категории услуг.
  Кэш `pricing(locationId)` сбрасывают запись правил и смена шага округления.

## Кабинет

Права: чтение - `pricing:read`, запись - `pricing:write`. Префикс `locations/:locationId`.

### Наценки

```
PriceRuleResponseDto {
  id, kind: SURCHARGE, scheduleType, name, note: string | null, enabled, archived: boolean,
  valueType, value,                                    // "20.00"
  visitFrom: string | null, visitTo: string | null, yearly, holidayExclusive,
  weekdays: number[], intervals: [{ start: "17:00", end: "21:00" }], dates: string[],
  appliesToAll, targets: [{ type, id, name, excluded }], serviceCount: number,   // сколько услуг затронуто
  status: ACTIVE | SCHEDULED | ENDED | DISABLED | ARCHIVED,
  nextDate: string | null,                             // ближайшая дата действия от «сегодня» филиала
  stats30d: { amount: string; bookingsCount: number }, // наценки в записях с визитом за 30 дней, без отменённых
  createdAt, updatedAt
}
PriceRuleInputDto { scheduleType, name, note?, enabled?, valueType, value, visitFrom?, visitTo?, yearly?,
                    holidayExclusive?, weekdays?, intervals?, dates?, appliesToAll, targets? [{ type, id, excluded? }] }
```

- `GET price-rules?archived=false|true` -> `PriceRuleResponseDto[]` (по `createdAt`).
- `GET price-rules/:ruleId`, `POST price-rules`, `PUT price-rules/:ruleId` (полная замена) -> `PriceRuleResponseDto`.
- `PATCH price-rules/:ruleId/enabled { enabled }`, `POST price-rules/:ruleId/archive`, `POST .../restore`,
  `POST .../duplicate` (копия «Название (копия)», выключена) -> `PriceRuleResponseDto`.
- `POST price-rules/preview { rule: PriceRuleInputDto, ruleId?: string }` ->
  `{ status, nextDate, examples: [{ serviceId, serviceTitle, levelName: string | null, before, raw, after }],
     replaces: [{ ruleId, name, scheduleType, valueType, value }], conflicts: [{ ruleId, name, date }] }`.
  `examples` - до 3 затронутых услуг (базовый уровень и один другой уровень, если есть); `raw` - до округления;
  `replaces` - наценки, которые праздничная отменяет в свои даты; `conflicts` - другие праздничные на те же даты.
- Валидация (400 `PRICE_RULE_INVALID` с полем `field`): лишние поля для типа, пустые обязательные, `% > 1000`,
  пересечение интервалов, чужие цели.
- Сохранение праздничной с `holidayExclusive` на дату, где уже есть такая же: 409
  `PRICE_RULE_HOLIDAY_CONFLICT`, payload `{ ruleId, ruleName, date }`. Проверка под блокировкой филиала.
- Ошибки: `PRICE_RULE_NOT_FOUND` 404, `PRICE_RULE_ARCHIVED` 409 (правка архивного).

### Округление

- `LocationResponseDto` + `priceRoundingStep: string`.
- `PUT pricing/settings { priceRoundingStep }` -> `{ priceRoundingStep }` (`pricing:write`; только значения из списка).
- `POST pricing/rounding-preview { priceRoundingStep }` ->
  `{ examples: [{ serviceTitle, basePrice, label, raw, rounded, largeStep: boolean }] }`: до 4 услуг филиала
  с разной ценой; у каждой - действующая процентная наценка, а без неё «+15%»; одна строка «−15%» округляется
  вниз (как будущие скидки). `largeStep` - округление сдвинуло цену больше чем на 5%.

### Проверка цены и карта недели

- `POST pricing/explain { serviceId?, bundleId?, staffId: string | null, date, time }` ->
  `{ staffId, staffName, levelName, total, line: { basePrice, staffPrice, adjustments, listPrice, total },
     candidates: [{ staffId, name, levelName, personal: boolean, price, available: boolean }],
     notApplied: [{ ruleId, name, reason, intervals: [{ start, end }] }] }`.
  `adjustments`: `[{ kind, ruleId, title, valueType: string | null, value: string | null, amount }]`
  (`kind` - `PriceAdjustmentKind`, суммы со знаком).
  `staffId = null` - «Любой мастер»: мастер назначается по правилу филиала среди свободных в это время
  (как публичные слоты); никого нет - `staffId = null`, цена по базовой. `candidates` - все мастера услуги
  с ценой в это время.
- `GET pricing/week-map?serviceId=&staffId=&levelId=&weekStart=` (одно из `staffId` / `levelId`; ни одного -
  базовый уровень) -> `{ hours: { from: number; to: number }, days: [{ date, segments: [{ start, end, price,
  staffPrice, adjustments: [{ ruleId, title, amount }] }] }] }`. `hours` - границы смен мастеров услуги
  на этой неделе, без смен - 09:00-21:00.

### Уровни: таблица и массовое заполнение

- `GET price-levels/matrix` -> `{ levels: PriceLevelResponseDto[], categories: [{ id: string | null, name,
  services: [{ serviceId, title, basePrice, prices: [{ levelId, price: string | null }] }] }] }`.
  Правка ячейки - существующий `PUT services/:serviceId/level-prices`.
- `GET price-levels/personal-prices` -> `[{ staffId, staffName, avatarUrl, levelName, serviceId, serviceTitle,
  levelPrice, price }]`. Правка - существующий `PUT staff/:staffId/service-prices`.
- `POST price-levels/:levelId/bulk-fill/preview { categoryIds: string[], mode: PERCENT | AMOUNT | BASE,
  value?: string, priceRoundingStep }` -> `{ items: [{ serviceId, title, categoryName, basePrice,
  currentPrice: string | null, newPrice: string | null, checked: boolean, invalid: boolean }] }`.
  `categoryIds` пусто - все. `value` со знаком, `PERCENT` от −99 до 1000. `newPrice = null` при `BASE`.
  `checked = currentPrice === null`. `invalid` - цена вышла ≤ 0. Округление до ближайшего.
- `POST price-levels/:levelId/bulk-fill { ...preview, serviceIds: string[] }` -> `{ updated: number }`; цены
  пересчитываются заново. Базовый уровень - 400 `PRICE_LEVEL_DEFAULT_PRICE`; `invalid` строки - 400
  `PRICE_LEVEL_FILL_INVALID`.

## Окно записи (кабинет)

`POST public/locations/:locationId/pricing` + `startAt?: string` - местное время филиала без смещения
(`YYYY-MM-DDTHH:mm:ss`), как `startAt` при создании записи. Начало визита = `startAt` или самое раннее
`items[].startAt`. Без времени наценок нет. Окно записи передаёт время всегда, иначе показ и создание разойдутся.

## Публичная запись и виджет

- Цены «от/до» считаются по окну онлайн-записи (сегодня филиала + `advanceBookingWindowDays`) с наценками:
  - `BookingSetupServiceDto.priceFrom/priceTo`, `BookingSetupBundleDto.priceFrom/priceTo`;
  - `BookingSetupStaffDto.servicePrices: [{ serviceId, priceFrom, priceTo }]` (вместо `price`);
  - `BookingResolveStaffDto.price` (без `startAt` - минимум по окну, с `startAt` - точная) + `priceTo`.
- Слоты (`available-slots`) и `booking-resolve` с `startAt` считают цену с наценками.
- Создание записи (`expectedTotal`) - без изменений, сверка ловит наценки.
- Показ (страница и виджет), раздел 2.7 плана:
  - «от X» только когда `priceFrom != priceTo`;
  - у мастеров цены только когда они у мастеров разные (сравнение `priceFrom/priceTo`); «от», если у мастера
    `priceFrom != priceTo`;
  - под слотами цены только когда в этот день у слотов разные цены, тогда строка «Цена зависит от времени»;
    иначе цена один раз в карточке выбранного времени.

## Тексты ошибок (кабинет)

| Код | Текст |
|---|---|
| `PRICE_RULE_NOT_FOUND` | Наценка не найдена |
| `PRICE_RULE_INVALID` | Проверьте поля наценки |
| `PRICE_RULE_ARCHIVED` | Наценка в архиве. Верните её, чтобы изменить |
| `PRICE_RULE_HOLIDAY_CONFLICT` | На эту дату уже есть праздничная наценка |
| `PRICE_LEVEL_FILL_INVALID` | Цена уровня должна быть больше нуля |
