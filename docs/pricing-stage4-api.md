# Цены и акции, этап 4: контракт

Источник правды для бэкенда, кабинета, публичной страницы и виджета на время этапа 4.
Решения: [план](./pricing-plan.md), разделы 2.4, 2.5, 2.7, 5.2, 6, 7 («Решения этапа 4»). Форматы - как в
[контракте этапа 3](./pricing-stage3-api.md): деньги и проценты - строки с двумя знаками, даты `YYYY-MM-DD`,
время дня `HH:mm`, всё время - в поясе филиала. Имена полей ниже - договорённость; если существующий DTO уже
называет то же самое иначе, остаётся существующее имя, а этот файл правится.

## Решения этапа

- Акция - `PriceRule` с `kind = PROMOTION` в той же таблице. Расписание акции - всегда `WEEKLY`: необязательный
  период визита `visitFrom`/`visitTo`, дни недели (пусто = все дни, в отличие от наценки) и интервалы начала
  визита (пусто = весь день). Праздничных дат, `yearly` и `holidayExclusive` у акции нет.
- `scenario` - с какого сценария создана акция (иконка и подпись в списке): `HAPPY_HOURS`, `LEAD_TIME`,
  `NEW_CLIENTS`, `BIRTHDAY`, `PROMO_CODE`, `CUSTOM`. На расчёт не влияет, все условия доступны в любой акции.
- Условия акции (все необязательны, проверяются вместе):
  - период записи `bookingFrom`/`bookingTo` - «сегодня» филиала в момент записи;
  - срок до визита: `maxLeadMinutes` («не позже чем за N» - горящие окна: от записи до начала визита не больше N)
    и/или `minLeadMinutes` («не раньше чем за N» - запись заранее). Считается от момента расчёта до начала
    визита (UTC);
  - каналы `channels: (ONLINE | ADMIN)[]`, не пусто. `ONLINE` = страница записи и виджет (`PUBLIC_PAGE`,
    `WIDGET`), `ADMIN` = `MANUAL`;
  - мастера `staffIds` (пусто = все);
  - клиенты `clientFilter`: `ANY`, `NEW`, `BIRTHDAY` (+ `birthdayWindowDays` 0-30: дата визита в пределах
    ±N дней от дня рождения, через Новый год, 29 февраля в невисокосный год = 28 февраля);
  - промокод `promoCode` (3-32 символа, `A-Z 0-9 - _`, хранится в верхнем регистре, сравнение без учёта регистра,
    уникален среди не архивных акций филиала);
  - лимиты: `usageLimitTotal` (всего записей с акцией), `usageLimitPerClient` + `usageLimitPeriod`
    (`ALL_TIME | YEAR | MONTH | WEEK`; окно - ±365/30/7 дней от даты визита в обе стороны, иначе запись на более поздний визит,
    сделанная первой, не мешала бы второй);
  - `minVisitTotal` - сумма визита по прайсу (сумма `listPrice` позиций) не меньше.
- Новый клиент: клиент бренда без неотменённых записей (любого филиала) до этой; клиент из импорта
  (`importedAt`) новым не бывает; телефон, которого нет в базе бренда, - новый. Неизвестный клиент (онлайн до
  ввода телефона) - ни новый, ни именинник: такие акции не применяются.
- Использование акции = неотменённая запись, у позиции которой есть корректировка `PROMOTION` с этим `ruleId`.
  Лимиты считаются по записям, не по позициям. При создании записи счётчики читаются свежими в транзакции под
  блокировкой строк правил с лимитами (`SELECT ... FOR UPDATE`), исчерпан - акция не применяется и срабатывает
  обычная сверка `expectedTotal`.
- Персональная скидка клиента: `Client.discountPercent` (бренд, `0 < x <= 100`, null = нет). Это кандидат
  `CLIENT_DISCOUNT` наравне с акциями во всех каналах. Нужен известный клиент.
- Выбор скидки на позицию: кандидаты = подходящие акции + скидка клиента. Побеждает большая скидка в деньгах,
  при равенстве - скидка клиента, затем раньше созданная акция. Скидки не складываются. Своя цена позиции
  (`customPrice`) - кандидатов нет.
- Размер скидки: `PERCENT` - от цены по прайсу позиции; `AMOUNT` - на каждую позицию, к которой применяется
  (не на визит). Цена со скидкой округляется **вниз** до шага филиала, не ниже 0;
  `discountTotal = listPrice - chargedPrice`, раскладка: одна корректировка `PROMOTION` или `CLIENT_DISCOUNT`
  на полную сумму скидки (округление скидки не выделяется в `ROUNDING`).
- Комплекс FIXED - пакет: акция и скидка клиента считаются от цены комплекса по прайсу (подходит по `BUNDLE` или
  `appliesToAll`), скидка делится по позициям тем же распределением, что и цена.
- Промокод визита один (`promoCode` в запросе). Результат: `promoCode: { code, status, reason }` (`reason` - только у
  `NOT_APPLICABLE`), `status`:
  `APPLIED` (акция по коду применена хотя бы к одной позиции), `BETTER_APPLIED` (код подходит, но к позициям
  применена более выгодная скидка), `NOT_APPLICABLE` (код есть, условия не выполнены - `reason` из списка
  причин), `NOT_FOUND`.
- `showAsPromotion = false`: клиент видит просто более низкую цену - в публичных ответах у такой акции нет
  `listPrice`, метки, строки итога и `publicName` (корректировка в записи хранится полностью).
- Администратор (окно записи) выбирает акцию у позиции: `promotion: { mode: AUTO | NONE | RULE, ruleId? }`.
  `AUTO` - лучшая. `NONE` и `RULE` - только с `sale.price.override`, иначе 403. `RULE` с неподходящей акцией -
  409 `PROMOTION_NOT_APPLICABLE` с `reason`. `RULE` может выбрать и `CLIENT_DISCOUNT` (`ruleId = null`,
  `mode = CLIENT_DISCOUNT`).
- «от X» в каталоге и у мастеров считается с акциями, которые получит любой онлайн-клиент без кода: канал
  `ONLINE`, `clientFilter = ANY`, без промокода, без условия срока до визита и минимальной суммы, период записи
  включает сегодня, лимиты не исчерпаны. Остальные акции в «от» не входят.
- Созданные записи правки правил не трогают. Правка записи пересчитывает только позиции, которые пересчитывает
  сегодня (новые или изменённые услуга/мастер/время); остальные сохраняют слои.
- Текст условий для клиента собирает бэкенд (один источник для кабинета, страницы и виджета), см. «Условия».

## Данные (миграция `pricing_promotions`)

```
enum PriceRuleKind        + PROMOTION
enum PromotionScenario    HAPPY_HOURS | LEAD_TIME | NEW_CLIENTS | BIRTHDAY | PROMO_CODE | CUSTOM
enum PromotionChannel     ONLINE | ADMIN
enum PromotionClientFilter ANY | NEW | BIRTHDAY
enum PromotionLimitPeriod ALL_TIME | YEAR | MONTH | WEEK

PriceRule  + scenario PromotionScenario?, publicName VarChar(60)?, publicDescription VarChar(300)?,
             showAsPromotion Boolean default true, bookingFrom Date?, bookingTo Date?,
             minLeadMinutes Int?, maxLeadMinutes Int?, channels PromotionChannel[] default [],
             clientFilter PromotionClientFilter default ANY, birthdayWindowDays Int?,
             promoCode VarChar(32)?, usageLimitTotal Int?, usageLimitPerClient Int?,
             usageLimitPeriod PromotionLimitPeriod?, minVisitTotal Decimal(10,2)?
PriceRuleStaff  ruleId, staffId   @@id([ruleId, staffId]); каскад от правила и мастера
Client     + discountPercent Decimal(5,2)?
Booking    + promoCode VarChar(32)?
```

- Уникальный частичный индекс `(locationId, upper(promoCode)) WHERE kind = 'PROMOTION' AND archivedAt IS NULL
  AND promoCode IS NOT NULL`.
- CHECK: у `SURCHARGE` нет полей акции (scenario, публичные поля, каналы, клиенты, промокод, лимиты, сроки,
  период записи, мастера); у `PROMOTION` `PERCENT` value <= 100, `channels` не пусто, `publicName` не пусто;
  `minLeadMinutes`, `maxLeadMinutes` >= 0; лимиты > 0; `usageLimitPeriod` задан тогда и только тогда, когда
  задан `usageLimitPerClient`; `birthdayWindowDays` задан тогда и только тогда, когда `clientFilter = BIRTHDAY`;
  `Client.discountPercent` в (0, 100].
- Индекс для лимитов и отчётов: `BookingItemPriceAdjustment(ruleId)` уже есть.
- Аудит: события правил те же (`PRICE_RULE_*`), поля акции добавляются в `price-rule.fields`;
  `Client.discountPercent` - в поля аудита клиента.
- Снимок цен: акции (не архивные, включая выключенные) с мастерами и условиями. Счётчики лимитов и данные
  клиента в снимок не входят - их передаёт вызывающий в контексте расчёта.

## Ядро (`pricing/engine`)

```
QuoteRequest + context?: {
  channel: ONLINE | ADMIN,
  nowMs: number,                                   // момент расчёта, UTC
  today: string,                                   // «сегодня» филиала, YYYY-MM-DD
  visitStartMs: number | null,                     // начало визита, UTC (для срока до визита)
  client: { known: boolean; isNew: boolean; birthday: string | null /* MM-DD */; discountBp: number | null },
  promoCode: string | null,
  usage: { [ruleId]: { total: number; perClient: number } },   // только для акций с лимитами
  choice?: { [lineIndex]: { mode: AUTO | NONE | RULE | CLIENT_DISCOUNT; ruleId?: string } }
}
```

- Без `context` акций и скидки клиента нет (поведение этапа 3).
- `LineQuote.adjustments` получает `PROMOTION | CLIENT_DISCOUNT` с `ruleId`, `title` (внутреннее название),
  `publicTitle` (`publicName`, null при `showAsPromotion = false`), `valueType`, `value`, `amount` (минус).
- `VisitQuote` + `promoCode: { code, status, reason? } | null`.
- `explain` + причины: `WRONG_CHANNEL`, `WRONG_STAFF`, `OUT_OF_BOOKING_PERIOD`, `LEAD_TIME_TOO_SHORT`,
  `LEAD_TIME_TOO_LONG`, `CLIENT_UNKNOWN`, `NOT_NEW_CLIENT`, `NO_BIRTH_DATE`, `NOT_BIRTHDAY`,
  `PROMO_CODE_REQUIRED`, `BELOW_MIN_TOTAL`, `LIMIT_REACHED`, `CLIENT_LIMIT_REACHED`, `LESS_BENEFICIAL`
  (подошла, но выиграла другая скидка). Порядок проверки: этап 3, затем в порядке списка.
- `priceRange` и «Любой мастер» в слотах учитывают скидку: цена кандидата - цена со скидкой.

## Кабинет

Права: `pricing:read` / `pricing:write`, префикс `locations/:locationId`.

### Акции (те же `price-rules`)

```
PriceRuleResponseDto + {
  kind: SURCHARGE | PROMOTION,
  scenario: PromotionScenario | null,
  publicName, publicDescription: string | null, showAsPromotion: boolean,
  bookingFrom, bookingTo: string | null,
  minLeadMinutes, maxLeadMinutes: number | null,
  channels: PromotionChannel[],
  staff: [{ id, name }],
  clientFilter, birthdayWindowDays: number | null,
  promoCode: string | null,
  usageLimitTotal, usageLimitPerClient: number | null, usageLimitPeriod: PromotionLimitPeriod | null,
  minVisitTotal: string | null,
  usageCount: number,                       // записей с акцией за всё время (для «34 из 100»)
  conditions: string[],                     // текст условий для клиента, см. «Условия»
  stats30d: { amount, bookingsCount,        // для акции amount - сумма скидок (положительная), визиты за 30 дней
              revenue: string | null, newClients: number | null }   // у акций: итог позиций с акцией и новые клиенты; у наценок null
}
PriceRuleInputDto + { kind (по умолчанию SURCHARGE), scenario?, publicName?, publicDescription?, showAsPromotion?,
                      bookingFrom?, bookingTo?, minLeadMinutes?, maxLeadMinutes?, channels?, staffIds?,
                      clientFilter?, birthdayWindowDays?, promoCode?, usageLimitTotal?, usageLimitPerClient?,
                      usageLimitPeriod?, minVisitTotal? }
```

- `GET price-rules?kind=PROMOTION|SURCHARGE&archived=` (без `kind` - наценки, как раньше).
- `POST price-rules`, `PUT`, `PATCH enabled`, `archive`, `restore`, `duplicate` - как у наценок. Копия акции
  с промокодом получает `promoCode = null`.
- `GET price-rules/summary?kind=PROMOTION` -> `{ activeCount, scheduledCount, nextStartDate: string | null,
  revenue30d, revenuePrev30d, discount30d, bookings30d, newClients30d }` (карточки над списком).
- `POST price-rules/preview` для акции -> `{ status, nextDate, conditions: string[], serviceCount,
  totalServiceCount, examples: [{ serviceId, serviceTitle, levelName, before, after, amount }],
  overlaps: [{ ruleId, name, publicName, valueType, value, example: string }],
  matches30d: { bookingsCount, discount } }`. `overlaps` - включённые акции, у которых пересекаются услуги,
  каналы, мастера и время; `example` - короткий текст пересечения («Маникюр, пн 10:00»). `matches30d` - сколько
  записей за прошлые 30 дней (неотменённые, по позициям и времени визита, без условий клиента, срока, промокода
  и лимитов) получили бы акцию и скидка по прайсу.
- `POST price-rules/promo-code` -> `{ code }` - свободный случайный код (8 символов, без 0/O/1/I).
- Ошибки: `PRICE_RULE_INVALID` 400 с `field`; `PROMO_CODE_TAKEN` 409 `{ ruleId, ruleName }`.

### Страница акции

- `GET price-rules/:ruleId/report?period=30d|90d|all` ->
  `{ revenue, discount, bookingsCount, clientsCount, newClients, returningClients, avgDiscount,
     returnedRate: number | null, staff: [{ staffId, name, avatarUrl, bookingsCount, revenue, discount }],
     notReturned: { count, items: [{ clientId, name, phone, lastPromotionVisit }] } }`.
  - База - неотменённые записи с визитом в периоде и позицией с акцией. `revenue` - итог этих позиций,
    `discount` - сумма скидок. `newClients` - клиенты, для которых эта запись первая в бренде.
  - `returnedRate` - доля клиентов с завершённой записью по акции, у которых потом есть неотменённая запись
    в бренде без этой акции, среди тех, у кого с визита по акции прошло не меньше 14 дней; null - таких нет.
  - `notReturned` - те же клиенты (14+ дней) без последующих записей; `items` - первые 50 по дате визита,
    новые сверху.
- `GET price-rules/:ruleId/not-returned/export` -> xlsx (имя, телефон, email, визит по акции, мастер, услуга) -
  тем же способом, что существующие выгрузки Excel.

### Проверка цены

`POST pricing/explain` + `{ channel?: ONLINE | ADMIN (по умолчанию ONLINE), clientId?: string,
clientType?: NEW | REGULAR (если нет clientId; по умолчанию неизвестный), promoCode?: string,
bookedAt?: string (местное время записи, по умолчанию сейчас) }`.
Ответ + `line.discount: Adjustment | null`, `line.chargedPrice`, `promoCode`, `notApplied[].reason` из новых
причин, `notApplied[].kind: SURCHARGE | PROMOTION`. `candidates[].price` - цена со скидкой.

### Клиент

- `ClientResponseDto` + `discountPercent: string | null`, `discountStats: { bookingsCount, amount }`
  (записи со скидкой `CLIENT_DISCOUNT`, неотменённые, за всё время).
- `CreateClientDto`, `UpdateClientDto` + `discountPercent?: string | null`. Право - то же, что правка клиента.

### Окно записи

- `POST public/locations/:locationId/pricing` (с авторизацией кабинета) + `{ clientId?: string | null,
  promoCode?: string, items[].promotion?: { mode, ruleId? } }`; канал - `ADMIN`, если запрос из кабинета
  (как сейчас определяется доступ к `customPrice`), иначе `ONLINE`.
- Ответ: позиции + `discount: { kind: PROMOTION | CLIENT_DISCOUNT, ruleId, title, publicTitle, valueType, value,
  amount } | null`, `eligible: [{ kind, ruleId, title, amount, chargedPrice }]` (все подходящие скидки позиции,
  лучшая первая), `ineligible: [{ ruleId, title, reason }]` (акции на эту услугу, которые не подошли, для меню);
  итог + `discountTotal`, `promoCode`; сумма по прайсу и итог - существующие `listTotalAmount` и `totalAmount`.
- Создание и правка записи вручную: `promoCode?`, `items[].promotion?` - те же правила.
- Ответ записи (страница записи, поповер календаря): у позиции `adjustments` (все слои) и `discount` как выше;
  у записи `promoCode`.

## Публичная запись и виджет

- `booking-setup` + `promotions: PublicPromotionDto[]` - включённые акции с `showAsPromotion`, которые сейчас
  действуют или начнутся в окне онлайн-записи, канал `ONLINE`, без промокода (акции по коду не раскрываются).
  ```
  PublicPromotionDto { id, publicName, publicDescription: string | null, valueType, value,
                       clientFilter, requiresCode: boolean, conditions: string[] }
  ```
  У услуги и комплекса + `promotion: { label: string; promotionIds: string[] } | null`: одна акция - её
  `publicName`, несколько - «Скидки до N%» (N - наибольший процент; у `AMOUNT` - процент от `priceFrom`,
  округлённый вниз). `priceFrom` - по правилу «от X» выше.
- `GET public/locations/:locationId/promotions/:promotionId` -> `PublicPromotionDto` - для ссылки «Поделиться»
  (работает и для акции по коду, код не отдаётся); архивная, выключенная или закончившаяся - 404
  `PROMOTION_NOT_FOUND`.
- Слоты (`available-slots`) + `?promoCode=`; у слота + `listPrice?: string` (только если цена ниже прайса из-за
  показываемой акции) и `promotionId?: string`. Клиент неизвестен.
- `booking-resolve` + `promoCode?`, `clientPhone?`.
- `POST pricing` (публично) + `promoCode?`, `clientPhone?` (нормализованный, как при создании): клиент
  ищется в бренде по телефону, применяются акции для новых и именинников и скидка клиента. Ответ - как в окне
  записи, но `eligible`/`ineligible` нет, `discount` без `title` (только `publicTitle`), скидка клиента -
  `publicTitle = "Ваша скидка"`.
- Создание (`PublicCreateBookingDto`) + `promoCode?`; `promoCode` входит в хэш идемпотентности. `expectedTotal`
  - итог со скидками; `PRICE_CHANGED` как раньше.
- Ссылка «Поделиться»: страница записи филиала + `?promotion=<id>` (+ `&code=<CODE>` у акции по коду). Страница
  и виджет открывают «Условия акции» и подставляют код.

## Условия (текст для клиента)

`conditions: string[]`, строки по порядку, пустые пропускаются:
1. Размер и к чему: «−15% на все услуги, кроме окрашивания», «−15 BYN на маникюр и педикюр»,
   «−10% на все услуги» (до 3 названий целей, дальше «и ещё N»).
2. Когда: «Пн-Чт, начало визита с 10:00 до 13:00» / «Каждый день» / не выводится, если ограничений нет.
3. Даты визита: «С 1 октября 2026, без даты окончания» / «До 31 декабря 2026» / «1-31 декабря 2026».
4. Срок записи: «Запись не позже чем за 3 часа до визита» / «Запись не раньше чем за 7 дней до визита» /
   «Запись с 1 по 30 ноября».
5. Кто: «Для новых клиентов» / «В течение 7 дней до и после дня рождения» / «У мастеров: Елена Соколова».
6. Где: «Только онлайн-запись» / «Только у администратора» (обе - не выводится).
7. Лимиты и сумма: «Визит от 40 BYN», «1 раз на клиента», «1 раз в год на клиента», «Осталось 66 из 100».
8. Всегда: «На услугу действует одна скидка, самая выгодная».

## Тексты ошибок

| Код | Текст |
|---|---|
| `PROMO_CODE_TAKEN` | Такой промокод уже есть у другой акции |
| `PROMOTION_NOT_APPLICABLE` | Акция не подходит к этой услуге |
| `PROMOTION_NOT_FOUND` | Акция не найдена или уже закончилась |
| `PRICE_RULE_INVALID` (акция) | Проверьте поля акции |

Статусы промокода (страница записи, виджет, окно записи): `APPLIED` - «Промокод применён»; `BETTER_APPLIED` -
«Применена более выгодная скидка»; `NOT_APPLICABLE` - «Промокод не действует для этой записи» (+ причина:
«только для новых клиентов», «визит от 40 BYN», «закончились применения», «вы уже использовали этот промокод»,
«не в эти дни и часы», «для других услуг»); `NOT_FOUND` - «Такого промокода нет».

## Уточнения реализации

Как сделано в коде, где контракт выше был неполным или пришлось отступить.

Ядро:
- Контекст расчёта получил `catalogFloor` (цены «от X»): условия срока до визита и минимальной суммы считаются
  невыполненными. `LineQuote` получил `discount`, `eligible` (подходящие скидки, лучшая первая) и `ineligible`
  (включённые акции на позицию, которые не подошли). У позиции со своей ценой оба списка пустые.
- Без времени визита акций нет, скидка клиента есть. Промокод без времени - `NOT_APPLICABLE` с причиной
  `OUT_OF_INTERVAL`. Промокод выключенной акции - `NOT_APPLICABLE` с причиной `DISABLED`.
- Комплекс FIXED: условие мастеров выполняется, только если все мастера позиций в списке акции; выбор
  администратора берётся первый заданный; скидка делится пропорционально ценам по прайсу позиций.
- «Любой мастер» с контекстом ранжирует по цене со скидкой одной позиции (минимальная сумма визита - по этой
  позиции).

Кабинет:
- `PUT price-rules/:ruleId` не меняет `kind` (400 `PRICE_RULE_INVALID`, `field: "kind"`). `POST price-rules/promo-code`
  отвечает 200. `restore` акции, чей код уже занят, - 409 `PROMO_CODE_TAKEN`.
- Статус акции: `ENDED` - прошли `bookingTo` или `visitTo` либо не осталось дат визита; `SCHEDULED` - `bookingFrom`
  в будущем.
- `POST price-rules/preview` для обоих видов отдаёт поля этапа 3 и поля акции; `examples[].amount` положительная
  у обоих видов; пример акции не учитывает условия клиента, периода записи, срока, мастеров, промокода, лимитов
  и суммы (`raw = after`); `matches30d` - только расписание, цели, канал и мастера; у наценки `null`.
- Отчёт: `returnedRate` - доля 0-1, `lastPromotionVisit` - момент начала визита (ISO), период - визиты до текущего
  момента.
- Текст условий: названия целей не склоняются («−15% на все услуги, кроме: Окрашивание», «−15 BYN на Маникюр
  и Педикюр»); окно 0 дней - «В день рождения»; «не позже» и «не раньше» - отдельные строки; год в периоде записи
  - только если даты в разных годах. В публичных условиях нет строки «Осталось X из N» (счётчики в модуле записей).
- `POST pricing/explain`: `clientType` - enum `PriceExplainClientType`.

Клиент:
- `discountStats` есть и в поиске, и в подборе клиента (один групповой запрос на страницу).
- `UpdateClientDto.discountPercent`: не передано - без изменений, `null` - снять скидку.

Окно записи и записи:
- Кабинетный запрос `POST public/locations/:locationId/pricing` - с токеном, у которого есть запись записей
  филиала. `clientId` и `items[].promotion` без такого токена - 403.
- `promoCode` в ответах: `{ code, status, reason }` (`PromoCodeResultDto`, без `ruleId`). `Booking.promoCode`
  сохраняется, только если код применён (`APPLIED`).
- Ручное создание и правка: исчерпанный лимит - 409 `PROMOTION_NOT_APPLICABLE` с `lineIndex: -1` (не
  `PRICE_CHANGED`: сверки `expectedTotal` у администратора нет). `UpdateBookingItemPriceDto.customPrice` остаётся
  обязательным - при смене акции позиции передаётся текущая своя цена. Комплекс в ручной записи не выбирает акцию
  по позициям (у ручной записи с `bundleId` нет `items`). Правка пересчитывает позиции с новым выбором акции, а все
  позиции - при смене промокода или у комплекса.
- Слоты: `listPrice` и `promotionId` отсутствуют, если показываемая акция цену слота не снизила.
- Позиция записи: `adjustments: [{ kind, ruleId, title, publicTitle, valueType, value, amount }]` и `discount`;
  страница записи клиента: у позиции `listPrice: string | null` и `discount: { title, amount } | null` - только для
  показываемой скидки и без своей цены.
