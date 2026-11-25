# Цены и акции, этап 6: плановая смена цен, откат, Excel - контракт

Источник правды для бэкенда (crm-core) и кабинета (crm-frontend) на время этапа 6. Решения: [план](./pricing-plan.md),
разделы 2.9, 3.3, 3.5, 3.6 и раздел 7 «Решения этапа 6» (обязательны). Форматы - как в
[контракте этапа 3](./pricing-stage3-api.md): деньги в DTO - строки с двумя знаками, проценты - строки с двумя знаками
(`"10.00"`), даты - `YYYY-MM-DD` в поясе филиала. Имена полей ниже - договорённость; если существующий DTO уже называет
то же самое иначе, остаётся существующее имя, а этот файл правится. Виджет и публичная страница не меняются
(цены приходят через ядро).

## Решения этапа

- Одно понятие - **изменение цен** (`ServicePriceChange`). Источник `RULE` (диалог «Изменить цены») или `IMPORT`
  (загрузка Excel). Применяется сразу (`effectiveDate: null` в запросе) или с даты (`effectiveDate > сегодня филиала`).
- Изменение хранит **абсолютные** цены «станет» по каждой цели. Процент и сумма считаются один раз при создании от цены,
  действующей на дату изменения (с учётом более ранних запланированных изменений). Если позже ранний план отменят или
  цену поправят вручную, «станет» не пересчитывается: ручная правка до даты план не отменяет (решение этапа 6).
- Цели одной строки: `BASE` (базовая цена услуги), `LEVEL` (цена уровня, `null` = как базовая), `STAFF` (личная цена
  мастера, `null` = нет личной цены), `BUNDLE` (цена комплекса FIXED). Комплексы SUM своей цены не имеют и в изменения
  не входят. Товары - этап 7.
- «Было» в строке: при планировании - цена, действующая на дату (для показа); при применении перезаписывается
  фактической ценой перед записью. Откат возвращает «было» только там, где текущая цена всё ещё равна «станет».
- Цена записи - по дате визита (локальная дата начала визита в поясе филиала, день с 00:00). Ядро само смотрит
  запланированные изменения; фоновая задача только переносит наступившие изменения в `Service.price`,
  `ServiceLevelPrice`, `StaffService.price`, `ServiceBundle.fixedPrice`. Созданные записи цены не меняют.
- Одна услуга (любая её цель) или один комплекс в двух **запланированных** изменениях на одну дату - 409. Разные даты
  допустимы.
- Кабинетный список услуг и карточка услуги показывают **текущую** цену; подсказка о будущей цене приходит отдельным
  эндпоинтом `service-price-changes/upcoming` (модуль `services` ниже `pricing` по зависимостям и не может читать
  изменения цен сам).
- Импорт без токена: подтверждение повторно отправляет тот же файл, сервер разбирает и проверяет его заново. Временного
  хранилища нет, файл до 5 МБ уже лежит в браузере, а повторная проверка ловит изменения данных между предпросмотром
  и подтверждением.

## Данные (миграция `20261127120000_pricing_price_changes`)

```prisma
enum ServicePriceChangeSource { RULE IMPORT }
enum ServicePriceChangeStatus { SCHEDULED APPLIED CANCELLED ROLLED_BACK }
enum ServicePriceChangeTarget { BASE LEVEL STAFF BUNDLE }
/// Why a row was not written on apply or not returned on rollback.
enum ServicePriceChangeSkip { TARGET_DELETED STAFF_NOT_ASSIGNED BUNDLE_NOT_FIXED CHANGED_AFTER LEVEL_IS_DEFAULT }

/// Price change of a location (docs/pricing-stage6-api.md): applied now or from a date.
model ServicePriceChange {
  id                   String                   @id @default(uuid())
  locationId           String
  source               ServicePriceChangeSource
  status               ServicePriceChangeStatus
  /// Local date the prices apply from. "Now" changes store the location today.
  effectiveDate        DateTime                 @db.Date
  title                String                   @db.VarChar(200)   // server-generated, see "Заголовок"
  /// RULE: { mode, value, priceRoundingStep, include } as sent; IMPORT: null.
  ruleSpec             Json?
  fileName             String?                  @db.VarChar(255)   // IMPORT
  servicesCount        Int                                          // distinct services in items
  bundlesCount         Int
  itemsCount           Int
  createdServicesCount Int                      @default(0)         // IMPORT: services created by the same upload
  applySkippedCount    Int                      @default(0)
  rollbackSkippedCount Int                      @default(0)
  createdById          String?
  cancelledById        String?
  rolledBackById       String?
  appliedAt            DateTime?
  cancelledAt          DateTime?
  rolledBackAt         DateTime?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt

  location Location               @relation(fields: [locationId], references: [id], onDelete: Cascade)
  items    ServicePriceChangeItem[]

  @@index([locationId, status, effectiveDate])
  @@index([status, effectiveDate])      // cron
  @@index([locationId, createdAt])       // history
}

model ServicePriceChangeItem {
  id           String                   @id @default(uuid())
  changeId     String
  targetType   ServicePriceChangeTarget
  serviceId    String?                  // BASE, LEVEL, STAFF
  priceLevelId String?                  // LEVEL
  staffId      String?                  // STAFF
  bundleId     String?                  // BUNDLE
  /// Names at creation, so history survives deleted targets.
  targetTitle  String                   @db.VarChar(150)
  levelName    String?                  @db.VarChar(60)
  staffName    String?                  @db.VarChar(250)
  /// Null: no level price (as base) / no personal price. Never null for BASE and BUNDLE.
  beforePrice  Decimal?                 @db.Decimal(10, 2)
  afterPrice   Decimal?                 @db.Decimal(10, 2)
  applySkip    ServicePriceChangeSkip?
  rollbackSkip ServicePriceChangeSkip?
  rolledBack   Boolean                  @default(false)

  change     ServicePriceChange @relation(fields: [changeId], references: [id], onDelete: Cascade)
  service    Service?           @relation(fields: [serviceId], references: [id], onDelete: SetNull)
  priceLevel PriceLevel?        @relation(fields: [priceLevelId], references: [id], onDelete: SetNull)
  staff      Staff?             @relation(fields: [staffId], references: [id], onDelete: SetNull)
  bundle     ServiceBundle?     @relation(fields: [bundleId], references: [id], onDelete: SetNull)

  @@index([changeId])
  @@index([serviceId])
  @@index([priceLevelId])
  @@index([staffId])
  @@index([bundleId])
}
```

- Удаление цели не удаляет строку истории: ссылка становится `null` (`SetNull`), имена остаются. Строка с `null`
  ссылкой при применении и откате получает `TARGET_DELETED`. Удаление филиала удаляет всё каскадом.
- CHECK (raw SQL в миграции):
  - `ServicePriceChangeItem_target_check`: `BASE` - только `serviceId`; `LEVEL` - `serviceId` и `priceLevelId`;
    `STAFF` - `serviceId` и `staffId`; `BUNDLE` - только `bundleId` (каждая из этих ссылок может стать `null` после
    удаления, лишние ссылки запрещены всегда);
  - `afterPrice IS NOT NULL` для `BASE` и `BUNDLE`; `beforePrice >= 0`, `afterPrice >= 0`.
- `AuditEntity` + `SERVICE_PRICE_CHANGE`; `AuditEvent` + `SERVICE_PRICE_CHANGE_CREATED`, `SERVICE_PRICE_CHANGE_APPLIED`,
  `SERVICE_PRICE_CHANGE_CANCELLED`, `SERVICE_PRICE_CHANGE_ROLLED_BACK`, `SERVICE_PRICES_IMPORTED`.
- Обратные связи (`servicePriceChangeItems`) в `Service`, `PriceLevel`, `Staff`, `ServiceBundle`, `Location`.
- Данных для переноса нет (prod нет).

### Заголовок

Сервер формирует `title` (для истории и аудита), строки ниже - точный формат:
- `RULE`: `+10%` / `-5%` / `+5 BYN` / `-5 BYN` / `Новые цены`; через `, `: `округление до 1 BYN` (если шаг не `0.01`).
  Знак минуса - обычный дефис. Валюта - валюта филиала.
- `IMPORT`: `Загрузка из Excel: <fileName>`.

## Ядро (`pricing/engine`)

```ts
PricingSnapshot + timezone: string                       // IANA зона филиала
                + priceChanges: PricingPriceChangeEntry[] // только SCHEDULED, по effectiveDate, затем createdAt
PricingPriceChangeEntry {
  id: string;
  effectiveDate: string;                                  // YYYY-MM-DD
  items: {
    target: BASE | LEVEL | STAFF | BUNDLE;
    serviceId: string | null; levelId: string | null; staffId: string | null; bundleId: string | null;
    price: number | null;                                 // minor; null - убрать цену уровня / личную цену
  }[];
}
```

- Новый чистый класс `engine/price-timeline.ts` - `PriceTimeline(changes)`: по ключу цели (`BASE:s`, `LEVEL:s:l`,
  `STAFF:s:st`, `BUNDLE:b`) хранит отсортированные `[date, price]`. `resolve(key, date, current)` - цена последнего
  изменения с `effectiveDate <= date`, иначе `current` (значение из БД). Строки с удалённой целью (`null` ссылки)
  в снимок не попадают. Тот же класс используют предпросмотр и импорт («было» на дату).
- `new PriceBook(snapshot, today)` - `today` обязателен (`YYYY-MM-DD`, сегодня филиала). Часов у ядра нет: `today`
  считает вызывающий, `TimeUtils.zonedDateStr(new Date(), snapshot.timezone)`. Единая точка - `PricingFacade.priceBook`;
  остальные места, которые строят `PriceBook` сами (`price-explain.service.ts`, `price-rule-preview.service.ts`,
  `price-week-map.service.ts`, `service-price.calculator.ts`), получают `today` так же. Снимок кэшируется на сутки,
  поэтому `today` в снимок не входит.
- Дата цены: `request.visit?.date ?? today`. По ней `staffLayer(serviceId, staffId, date)` берёт базовую цену, цену
  уровня (`null` в изменении = как базовая), личную цену (`null` = нет личной, дальше уровень), а `fixedBundleLines` -
  цену комплекса FIXED (изменение `BUNDLE` действует, только если комплекс в снимке FIXED).
- Публичные методы получают дату:
  - `staffPrice(serviceId, staffId, date = today)`;
  - `candidatePrice(...)` - дата визита или `today`;
  - `quote/explain` - по `visit.date` или `today`;
  - `priceRange(scope, dates)` - цена без правил считается **для каждой даты** (сейчас один раз), если у позиции есть
    изменения внутри дат; без изменений - как сейчас;
  - `daySegments(scope, date)` - по `date`;
  - новые `basePriceAt(serviceId, date)`, `fixedPriceAt(bundleId, date)` - для показа цены каталога.
- `booking-setup-prices.rules.ts`: ключ кэша диапазона строки сейчас `book.staffPrice(serviceId, staffId)`; станет
  `book.staffPriceKey(serviceId, staffId, dates)` - цены мастера на первую дату и на каждую дату изменения внутри дат
  через `,` (мастера с одинаковой ценой во всём окне по-прежнему делят диапазон).
- Загрузчик `PricingSnapshotService.loadFresh`: читает `ServicePriceChange` со статусом `SCHEDULED` и строками,
  `location.timezone`. Кэш `pricing(locationId)` сбрасывают создание, отмена, применение и откат изменения.

### Где цена читается в обход ядра

| Место | Сейчас | Станет |
|---|---|---|
| `BookingSetupServiceDto.price` (`booking-setup-service.dto.ts`) | `service.price` | `book.basePriceAt(id, date)`; `date` - дата `startAt` или `today` |
| `BookingSetupBundleDto.price` (`booking-setup-bundle.dto.ts`) | `BundleMetrics.price(bundle)` | FIXED - `book.fixedPriceAt`, SUM - сумма `basePriceAt` услуг на ту же дату |
| `booking-setup.service.ts` `totalListPrice` | `BundleMetrics.price` / сумма `service.price` | то же через ядро на дату `startAt` или `today` |
| `booking-setup-category.dto.ts` запасная цена, `booking-setup-prices.rules.ts` `catalogPrice` | `service.price` | без изменений: только для услуг вне снимка (ядро их не считает) |
| Кабинет: `service-catalog`, `services/:id`, `service-bundles/:id`, матрица уровней, личные цены, `services/:id/prices`, массовое заполнение | текущие значения из БД | без изменений: показывают и правят текущую цену; будущая - `upcoming` |
| Аудит полей услуги и комплекса, онбординг | `price`/`fixedPrice` | без изменений |

Слоты, `booking-resolve`, `/pricing`, создание записи, перенос - уже через ядро с `visit`, получают цену по дате визита
без правок.

## Кабинет: изменение цен по правилу

Префикс `locations/:locationId`. Права: чтение - `Read(PRICING)`, запись - `Write(PRICING)`.

### Предпросмотр - `POST service-price-changes/preview` (`Read(PRICING)`, как bulk-fill preview)

```ts
ServicePriceChangeSpecDto {
  allServices: boolean;              // true: все услуги и комплексы FIXED филиала; списки ниже игнорируются
  serviceIds: string[];              // uuid
  categoryIds: string[];             // услуги категории и её комплексы FIXED
  bundleIds: string[];               // только FIXED, иначе 400 SERVICE_PRICE_CHANGE_INVALID { field: 'bundleIds' }
  mode: PERCENT | AMOUNT | SET;      // enum ServicePriceChangeMode
  value: string | null;              // PERCENT: -99.00..1000.00; AMOUNT: со знаком; SET: >= 0 или null
  priceRoundingStep: string;         // PRICE_ROUNDING_STEPS, как у массового заполнения
  include: { levelPrices: boolean; staffPrices: boolean; fixedBundles: boolean };
  effectiveDate: string | null;      // null - сейчас
}
```

- Хотя бы одно из `allServices`, `serviceIds`, `categoryIds`, `bundleIds` непустое, иначе 400
  `SERVICE_PRICE_CHANGE_INVALID { field: 'scope' }`. Чужие id - тот же код с `field`. Услуги - `ACTIVE` и `INACTIVE`.
- `effectiveDate`: `> сегодня филиала` и `<= сегодня + 730 дней`, иначе 400 `SERVICE_PRICE_CHANGE_DATE_INVALID`.
- Дата расчёта `D = effectiveDate ?? today`. «Было» - через `PriceTimeline` на `D` (учитывает более ранние
  запланированные изменения).
- Строки на услугу: `BASE` всегда; `LEVEL` - если `include.levelPrices` и на `D` у услуги есть своя цена этого
  не базового уровня (уровни без своей цены идут за базовой и строк не получают); `STAFF` - если `include.staffPrices`
  и на `D` у активного мастера, назначенного на услугу, есть личная цена. На комплекс FIXED - `BUNDLE`, если
  `include.fixedBundles` (комплексы из `bundleIds` берутся всегда).
- Расчёт «станет»:
  - `PERCENT`: `before + sign × round_half_up(before × |value| / 100)`, затем округление до ближайшего шага;
  - `AMOUNT`: `before + value`, затем округление до ближайшего шага;
  - `SET`: `BASE` и `BUNDLE` получают `value` (без округления), `LEVEL` и `STAFF` - `after = before` (правятся вручную);
    `value = null` - все строки `after = before`.
  Это `levelFillPrice` без режима `BASE`: общую функцию вынести в `rules/price-change-value.rules.ts`.
- `invalid`: `after > PRICE_MAX_MINOR`, или `after < 0`, или `after = 0` при `before > 0`. Бесплатная услуга
  (`before = 0`) от процента остаётся 0.
- `checked = !invalid && after !== before`.

```ts
ServicePriceChangePreviewResponseDto {
  date: string;                      // D
  groups: [{
    kind: SERVICE | BUNDLE; id: string; title: string;
    categoryId: string | null; categoryName: string | null; status: ServiceStatus;
    rows: [{
      key: string;                   // "BASE:<serviceId>" | "LEVEL:<serviceId>:<levelId>" | "STAFF:<serviceId>:<staffId>" | "BUNDLE:<bundleId>"
      targetType: BASE | LEVEL | STAFF | BUNDLE;
      levelId: string | null; levelName: string | null;
      staffId: string | null; staffName: string | null;
      before: string | null;         // null только у LEVEL/STAFF из импорта (цены не было)
      after: string | null;          // null только у LEVEL/STAFF: убрать цену
      invalid: boolean; checked: boolean;
    }];
  }];
  counts: { services: number; bundles: number; rows: number; changed: number; invalid: number };
  affectedBookingsCount: number;
  conflicts: [{ changeId: string; title: string; effectiveDate: string; serviceIds: string[]; bundleIds: string[] }];
}
```

- Порядок: группы по `sortOrder` категории (без категории - в конце), затем `sortOrder` и `title`; комплексы после
  услуг своей категории. Строки: `BASE`, `LEVEL` по `sortOrder` уровня, `STAFF` по имени.
- `affectedBookingsCount` (только при `effectiveDate`, иначе 0): записи `PENDING`/`CONFIRMED` с позицией, у которой
  `startAt >= zonedDateStart(effectiveDate)`, и `serviceId` из групп или `Booking.bundleId` из групп. Они сохраняют
  цену; текст «N записей на эти даты уже созданы и сохранят прежнюю цену».
- `conflicts`: запланированные изменения на ту же дату с теми же услугами или комплексами (создание будет 409).
- Лимит строк - `SERVICE_PRICE_CHANGE_MAX_ITEMS = 10000`, больше - 400 `SERVICE_PRICE_CHANGE_TOO_LARGE`.

### Создание - `POST service-price-changes` (`Write(PRICING)`)

```ts
CreateServicePriceChangeDto extends ServicePriceChangeSpecDto {
  selectedKeys: string[];                             // отмеченные строки, 1..10000
  overrides: [{ key: string; price: string | null }]; // ручная правка «станет»; ключ входит в selectedKeys
}
```

- Сервер заново считает предпросмотр по той же спецификации, берёт строки `selectedKeys` и подставляет `overrides`.
- Ключ из `selectedKeys` или `overrides`, которого нет в пересчёте (данные изменились: убрали цену уровня, сняли
  мастера) - 409 `SERVICE_PRICE_CHANGE_STALE { keys: string[] }`; фронт повторяет предпросмотр.
- Правка: цена `>= 0`, `<= PRICE_MAX_MINOR`, два знака; `null` только у `LEVEL` и `STAFF`, иначе 400
  `SERVICE_PRICE_CHANGE_ROW_INVALID { key }`. Правка не округляется.
- Отмеченная `invalid` строка без правки - 400 `SERVICE_PRICE_CHANGE_ROW_INVALID { key }`.
- Строки, где итоговое `after === before`, отбрасываются. Ничего не осталось - 400 `SERVICE_PRICE_CHANGE_EMPTY`.
- Всё в одной транзакции под `pg_advisory_xact_lock(hashtextextended('service-price-change:' || locationId, 0))`:
  1. применяются наступившие изменения филиала (как в фоновой задаче), чтобы «сейчас» и проверки видели свежие цены;
  2. при `effectiveDate`: проверка пересечений - `SCHEDULED` изменения с той же `effectiveDate` и общей услугой
     (любая цель с этим `serviceId`) или комплексом - 409 `SERVICE_PRICE_CHANGE_DATE_CONFLICT
     { changeId, title, effectiveDate, serviceIds, bundleIds }`; лимит `SERVICE_PRICE_CHANGE_MAX_SCHEDULED = 50`
     запланированных на филиал - 409 `SERVICE_PRICE_CHANGE_LIMIT`;
  3. запись изменения: `SCHEDULED` с «было» на дату, или (без даты) `effectiveDate = today`, применение строк
     (раздел «Применение»), `APPLIED`, `appliedAt = now`.
- Ответ - `ServicePriceChangeDetailDto` (ниже). Сбрасываются `pricing(locationId)`, при применении также
  `serviceCatalog(locationId)`.

## Применение (общее для «сейчас» и фоновой задачи)

`ServicePriceChangeApplier.apply(tx, change, now)`; вызывается под блокировкой филиала:

- Повторная проверка: `updateMany where { id, status: SCHEDULED }` - 0 строк значит изменение уже применено или
  отменено, выход (идемпотентно).
- Строки по порядку: `BASE` - `Service.price`; `LEVEL` - upsert/удаление `ServiceLevelPrice`; `STAFF` -
  `StaffService.price` (строка назначения должна быть, иначе `applySkip = STAFF_NOT_ASSIGNED`, назначение не создаётся);
  `BUNDLE` - `ServiceBundle.fixedPrice` (комплекс уже SUM - `BUNDLE_NOT_FIXED`). Цель удалена - `TARGET_DELETED`. Уровень цен, ставший уровнем по умолчанию (цен уровня у него нет) - `LEVEL_IS_DEFAULT`.
- Перед записью `beforePrice` = фактическое текущее значение (`null` - нет цены уровня / личной цены).
- `applySkippedCount`, `status = APPLIED`, `appliedAt`. Аудит `SERVICE_PRICE_CHANGE_APPLIED` (в фоне - актор
  `AuditActorRole.SYSTEM`). Сброс `pricing` и `serviceCatalog` после коммита.

### Фоновая задача

- `ServicePriceChangeCron`, `@ExclusiveCron('0 */15 * * * *')` в `pricing` (как `booking-cron.service.ts`).
- Кандидаты: `SCHEDULED` с `effectiveDate <= UTC-сегодня + 1 день` (самый восточный пояс), группировка по филиалу.
  По каждому филиалу `today = TimeUtils.zonedDateStr(now, location.timezone)`; изменения с `effectiveDate <= today`
  по `effectiveDate`, `createdAt` применяются по одному, каждое в своей транзакции под блокировкой филиала.
- Ошибка одного изменения логируется и не останавливает остальные; следующий запуск повторит. Корректность цен от
  задачи не зависит: до применения ядро уже считает по дате.

## Отмена и откат

### `POST service-price-changes/:changeId/cancel` (`Write(PRICING)`)

- Под блокировкой филиала сначала применяются наступившие изменения. Затем только `SCHEDULED` -> `CANCELLED`
  (`cancelledAt`, `cancelledById`), иначе 409 `SERVICE_PRICE_CHANGE_NOT_SCHEDULED`. Цены не трогаются.
- Аудит `SERVICE_PRICE_CHANGE_CANCELLED`, сброс `pricing`. Ответ - `ServicePriceChangeDetailDto`.

### `POST service-price-changes/:changeId/rollback` (`Write(PRICING)`)

- Под блокировкой филиала: наступившие изменения применяются, затем только `APPLIED` -> `ROLLED_BACK`, иначе 409
  `SERVICE_PRICE_CHANGE_NOT_APPLIED` (запланированное - отменять).
- По каждой строке без `applySkip`: текущее значение цели сравнивается с `afterPrice` (`null` = цены нет).
  Равно - пишется `beforePrice` (`null` - удалить цену уровня / личную цену), `rolledBack = true`. Иначе
  `rollbackSkip`: `CHANGED_AFTER`, `TARGET_DELETED`, `STAFF_NOT_ASSIGNED`, `BUNDLE_NOT_FIXED`, `LEVEL_IS_DEFAULT`.
- Запланированные позже изменения тех же целей не трогаются: они наступят в свою дату со своими «станет».
- Откат загрузки возвращает только цены; созданные услуги и категории остаются. Созданные записи цены не меняют.
- `rollbackSkippedCount`, `rolledBackAt`, `rolledBackById`; аудит `SERVICE_PRICE_CHANGE_ROLLED_BACK`; сброс
  `pricing` и `serviceCatalog`.
- Ответ `{ change: ServicePriceChangeDetailDto; restoredCount: number; skipped: ServicePriceChangeRowDto[] }`;
  `skipped` - строки с `rollbackSkip` и текущей ценой (`current`), для списка «Не возвращены: цена менялась после».

## История

### `GET service-price-changes` (`Read(PRICING)`)

Запрос - `PaginationRequestDto` (`page`, `pageSize` до 100) + `status?: ServicePriceChangeStatus`.
Порядок: `SCHEDULED` по `effectiveDate` возр., затем остальные по `COALESCE(appliedAt, cancelledAt, createdAt)` убыв.

```ts
ServicePriceChangeSummaryDto {
  id; source: RULE | IMPORT; status; title; effectiveDate: string;
  ruleSpec: { mode; value: string | null; priceRoundingStep: string; include } | null;
  fileName: string | null;
  servicesCount; bundlesCount; itemsCount; createdServicesCount; applySkippedCount; rollbackSkippedCount;
  createdBy: { id: string; name: string } | null;      // имя по createdById, null - пользователь удалён
  createdAt; appliedAt: string | null; cancelledAt: string | null; rolledBackAt: string | null;  // ISO UTC
  canCancel: boolean;    // SCHEDULED
  canRollback: boolean;  // APPLIED
}
```

Ответ - `{ items, page, pageSize, totalItems }` как у `service-catalog`.

### `GET service-price-changes/:changeId` (`Read(PRICING)`)

```ts
ServicePriceChangeDetailDto extends ServicePriceChangeSummaryDto {
  groups: [{
    kind: SERVICE | BUNDLE; id: string | null;           // null - цель удалена
    title: string; categoryName: string | null;           // категория - текущая, у удалённой цели null
    rows: ServicePriceChangeRowDto[];
  }];
}
ServicePriceChangeRowDto {
  itemId; targetType; levelId: string | null; levelName: string | null; staffId: string | null; staffName: string | null;
  before: string | null; after: string | null;
  current?: string | null;                                // только в ответе отката
  applySkip: ServicePriceChangeSkip | null; rollbackSkip: ServicePriceChangeSkip | null; rolledBack: boolean;
}
```

404 `SERVICE_PRICE_CHANGE_NOT_FOUND` - нет изменения в этом филиале.

### `GET service-price-changes/upcoming` (`Read(SERVICE)`)

Для плашки в «Услугах», подсказки в таблице и в карточке услуги (экран доступен с `service:read`, будущая базовая
цена не секретнее текущей).

```ts
ServicePriceUpcomingDto {
  next: { effectiveDate: string; changesCount: number; servicesCount: number; bundlesCount: number } | null;
  services: [{ serviceId: string; effectiveDate: string; price: string }];   // ближайшая будущая BASE
  bundles:  [{ bundleId: string;  effectiveDate: string; price: string }];   // ближайшая будущая BUNDLE
}
```

- `next` - ближайшая дата среди `SCHEDULED` (включая уже наступившие, но ещё не применённые): число изменений
  и различных услуг / комплексов на эту дату (любые цели). Плашка: «С 1 января изменятся цены 12 услуг».
- `services`/`bundles` - только цели `BASE`/`BUNDLE`, по одной ближайшей записи на услугу; если ближайшая цена
  равна текущей, строка не выводится. Подсказка: «С 1 января: 55 BYN».

## Excel

Константы: `SERVICE_PRICE_IMPORT_MAX_BYTES = 5 MB`, `SERVICE_PRICE_IMPORT_MAX_ROWS = 2000` (на лист),
`SERVICE_PRICE_IMPORT_MAX_LISTED_ERRORS = 200`. Файловый интерцептор - как `ClientImportFileInterceptor`
(`LIMIT_FILE_SIZE` -> 413). `XlsxUtils.read` и `rows` читают только первый лист - нужен новый
`XlsxUtils.readBook(buffer): Promise<{ sheet(name): XlsxGrid | null; first(): XlsxGrid | null } | null>`
(поиск листа без учёта регистра и пробелов по краям).

### Формат (выгрузка, шаблон и загрузка)

Лист **«Цены»**, строка 1 - заголовки:

| Колонка | Выгрузка | Загрузка |
|---|---|---|
| `ID` | id услуги / комплекса | пусто - новая услуга; есть - меняются только цены, остальные колонки игнорируются |
| `Категория` | имя категории или пусто | новая услуга: категория по имени (без учёта регистра, обрезка пробелов); нет - создаётся; пусто - без категории |
| `Тип` | `Услуга` / `Комплекс` | новая строка: пусто или `Услуга`; `Комплекс` без ID - ошибка |
| `Название` | `title` | новая услуга: обязательно, до 150 |
| `Длительность (мин)` | `durationMinutes` (у комплекса пусто) | новая услуга: обязательно, целое 1-1440 |
| `Базовая цена` | `Service.price` / `fixedPrice` (текущие) | обязательно для новой; у строки с ID пусто - без изменения |
| `Цена: <уровень>` | по колонке на каждый не базовый уровень (`sortOrder`); пусто - как базовая | пусто - как базовая (у строки с ID это снимает цену уровня); у комплекса игнорируется |
| `Описание` | `description` | новая услуга: до 2000 |

- Выгружаются все услуги (`ACTIVE` и `INACTIVE`) и только комплексы FIXED; порядок - категория `sortOrder`, затем
  `sortOrder`, `title`; комплексы после услуг категории. Цены - числом с двумя знаками (ячейка Number).
- Лист **«Личные цены»**: `ID услуги`, `Услуга`, `ID мастера`, `Мастер`, `Цена`. Выгрузка - все назначения активных
  мастеров на услуги (`StaffService`), `Цена` - личная цена или пусто. Загрузка: пусто - нет личной цены (снимается),
  `Услуга` и `Мастер` игнорируются. Лист необязателен; строк, которых нет в файле, загрузка не касается.
- Синонимы заголовков (сравнение без регистра, `ё` = `е`, обрезка пробелов): `ID` - `id`, `ид`; `Категория` -
  `category`; `Тип` - `type`, `вид`; `Название` - `название услуги`, `услуга`, `name`, `title`; `Длительность (мин)` -
  `длительность`, `длительность, мин`, `duration`; `Базовая цена` - `цена`, `price`, `base price`; `Описание` -
  `description`; уровень - `Цена: <имя>` или `<имя>` уровня; `ID услуги` - `service id`; `ID мастера` - `staff id`,
  `id сотрудника`; `Мастер` - `сотрудник`, `staff`.
- Обязательные колонки: «Цены» - `ID`, `Название`, `Базовая цена`; «Личные цены» - `ID услуги`, `ID мастера`, `Цена`.
- Числа: ячейка Number или текст `55`, `55.5`, `55,50`, `1 200` (пробелы и неразрывные пробелы убираются, без валюты);
  больше двух знаков после запятой - ошибка.
- Лист «Цены» ищется по имени, иначе первый лист. Пустые строки пропускаются.

### `GET service-prices/export` (`Read(PRICING)`)

`StreamableFile` (`XlsxUtils.write`), имя `prices-YYYY-MM-DD.xlsx` (сегодня филиала), оба листа.

### `GET service-prices/template` (`Read(PRICING)`)

Эндпоинт, а не статический файл: колонки уровней - уровни салона. Имя `prices-template.xlsx`. Лист «Цены» - заголовки
и 2 строки-примера без ID: `Стрижки | Услуга | Женская стрижка | 60 | 50.00 | <по уровням: 60.00, 70.00…> | ` и
`Стрижки | Услуга | Мужская стрижка | 45 | 35.00 | <пусто> | Машинка и ножницы`. Лист «Личные цены» - только заголовки.
Фронт показывает ссылку «Скачать шаблон», как в импорте клиентов.

### `POST service-prices/import/preview` (`Write(PRICING)`, multipart `file`, `effectiveDate?` в форме)

Разбор и проверка без записи. Ошибки файла целиком - 400 `SERVICE_PRICE_IMPORT_FILE_INVALID { reason }`,
`reason`: `MISSING`, `UNSUPPORTED_TYPE`, `CORRUPT`, `MISSING_COLUMNS` (+ `sheet`, `columns: string[]`), `EMPTY`,
`TOO_MANY_ROWS` (+ `sheet`); размер - 413 `SERVICE_PRICE_IMPORT_FILE_TOO_LARGE`. Дата - как в правиле
(`SERVICE_PRICE_CHANGE_DATE_INVALID`).

```ts
ServicePriceImportPreviewDto {
  date: string;                                     // D = effectiveDate ?? today
  newServices: [{
    row: number; categoryName: string | null; categoryWillBeCreated: boolean;
    title: string; durationMinutes: number; price: string; description: string | null;
    levelPrices: [{ levelId: string; levelName: string; price: string }];   // только заполненные
  }];
  priceChanges: ServicePriceChangePreviewResponseDto['groups'];             // та же форма строк
  errors: [{ sheet: 'PRICES' | 'STAFF_PRICES'; row: number; column: string | null; code: ServicePriceImportRowError }];
  errorCount: number;                                                       // errors - первые 200
  counts: { newServices: number; newCategories: number; services: number; bundles: number; rows: number };
  affectedBookingsCount: number;
  conflicts: ServicePriceChangePreviewResponseDto['conflicts'];
  canApply: boolean;                                                        // errorCount = 0 и есть что применять
}
```

- `row` - номер строки как в Excel; `column` - заголовок из файла. Строки изменений: «было» на `D` через
  `PriceTimeline`, «станет» - из файла; равные значения строк не дают; все `checked = true`, `invalid` ошибкой строки
  (у импорта нет галочек: при ошибках применить нельзя).
- `ServicePriceImportRowError`: `ID_NOT_FOUND` (нет услуги / комплекса этого филиала), `DUPLICATE_ID`,
  `BUNDLE_NOT_FIXED`, `BUNDLE_CREATE_UNSUPPORTED`, `NAME_REQUIRED`, `NAME_TOO_LONG`, `DURATION_REQUIRED`,
  `DURATION_INVALID`, `PRICE_REQUIRED`, `PRICE_INVALID` (не число, < 0, > 2 знаков, > максимума), `CATEGORY_TOO_LONG`,
  `DESCRIPTION_TOO_LONG`, `DUPLICATE_SERVICE` (категория и название совпадают с существующей услугой или другой
  новой строкой, без учёта регистра), `UNKNOWN_LEVEL_COLUMN` (строка 1, колонка `Цена: X` без такого уровня),
  `SERVICE_NOT_FOUND`, `STAFF_NOT_FOUND` (нет активного мастера филиала), `STAFF_NOT_ASSIGNED`, `DUPLICATE_STAFF_PRICE`
  (пара услуга-мастер повторяется).
- Пересечение с запланированным изменением на ту же дату - в `conflicts`, подтверждение будет 409.

### `POST service-prices/import` (`Write(PRICING)`; при новых услугах ещё `Write(SERVICE)`)

Multipart `file` + `effectiveDate?` (пусто - сейчас). Тот же разбор; любые ошибки строк - 400
`SERVICE_PRICE_IMPORT_INVALID { errorCount, errors }` (форма как в предпросмотре). Новые услуги без права
`service:write` - 403 `SERVICE_PRICE_IMPORT_SERVICE_ACCESS` (проверка в сервисе через `AccessFacade`).

Одна транзакция под блокировкой филиала:
1. наступившие изменения применяются;
2. категории и услуги создаются сразу (даже при плановой дате): `ACTIVE`, `bufferMinutes = 0`, `sortOrder` после
   последней в категории, `ServiceLevelPrice` по заполненным колонкам уровней; мастера не назначаются;
3. изменения цен по строкам с ID - `ServicePriceChange` с `source = IMPORT`, `fileName`, `createdServicesCount`,
   статус и применение - как у правила (конфликт даты - 409 `SERVICE_PRICE_CHANGE_DATE_CONFLICT`). Нет изменённых
   цен - изменение не создаётся.

Ответ:

```ts
ServicePriceImportResultDto {
  change: ServicePriceChangeSummaryDto | null;
  createdServicesCount: number; createdCategoriesCount: number;
  createdServicesWithoutStaffCount: number;          // = createdServicesCount, для ссылки «N новых услуг без мастеров»
  createdServiceIds: string[];
}
```

Сброс `serviceCatalog` и `pricing`. Аудит: `SERVICE_CREATED` и `SERVICE_CATEGORY_CREATED` по каждой новой (как при
ручном создании), `SERVICE_PRICES_IMPORTED` на изменение (если оно есть), при «сейчас» ещё `SERVICE_PRICE_CHANGE_APPLIED`.

## Аудит

`AuditEntity.SERVICE_PRICE_CHANGE`, `entityId` - id изменения. Шаблон `audit/templates/ru/service_price_change.hbs`,
названия в `shared/i18n/ru.json` («entities»: `Изменение цен`; «events» ниже).

| Событие | Когда | `payload` | Строка шаблона |
|---|---|---|---|
| `SERVICE_PRICE_CHANGE_CREATED` («Изменение цен запланировано») | создание с датой по правилу | `title, effectiveDate, servicesCount, bundlesCount` | `{{title}} с {{effectiveDate}}: услуг {{servicesCount}}, комплексов {{bundlesCount}}` |
| `SERVICE_PRICES_IMPORTED` («Цены загружены из Excel») | подтверждение загрузки | `fileName, effectiveDate \| null, itemsCount, createdServicesCount` | `{{fileName}}: изменено цен {{itemsCount}}, новых услуг {{createdServicesCount}}` + `с {{effectiveDate}}`, если есть |
| `SERVICE_PRICE_CHANGE_APPLIED` («Цены изменены») | применение сейчас или фоновой задачей | `title, appliedCount, applySkippedCount` | `{{title}}: изменено цен {{appliedCount}}` + `, пропущено {{applySkippedCount}}`, если > 0 |
| `SERVICE_PRICE_CHANGE_CANCELLED` («Изменение цен отменено») | отмена | `title, effectiveDate` | `{{title}} с {{effectiveDate}}` |
| `SERVICE_PRICE_CHANGE_ROLLED_BACK` («Прежние цены возвращены») | откат | `title, restoredCount, rollbackSkippedCount` | `{{title}}: возвращено {{restoredCount}}, не возвращено {{rollbackSkippedCount}}` |

Даты в шаблоне - `formatValue` даты. Фоновая задача - актор `{ name: 'Система', role: SYSTEM }`.

## Ошибки

Все - новые значения `ErrorCode` в `src/shared/validation/error-codes.enum.ts` (сообщения английские, русские тексты
у фронта).

| Код | HTTP | Payload | Текст (фронт) |
|---|---|---|---|
| `SERVICE_PRICE_CHANGE_NOT_FOUND` | 404 | - | Изменение цен не найдено |
| `SERVICE_PRICE_CHANGE_INVALID` | 400 | `{ field }` | Проверьте условия изменения |
| `SERVICE_PRICE_CHANGE_DATE_INVALID` | 400 | `{ today, maxDate }` | Дата должна быть позже сегодняшней и не дальше двух лет |
| `SERVICE_PRICE_CHANGE_TOO_LARGE` | 400 | `{ max }` | Слишком много цен в одном изменении. Разделите по категориям |
| `SERVICE_PRICE_CHANGE_ROW_INVALID` | 400 | `{ key }` | Проверьте новую цену в строке |
| `SERVICE_PRICE_CHANGE_EMPTY` | 400 | - | Нет цен, которые изменятся |
| `SERVICE_PRICE_CHANGE_STALE` | 409 | `{ keys }` | Цены изменились. Проверьте список ещё раз |
| `SERVICE_PRICE_CHANGE_DATE_CONFLICT` | 409 | `{ changeId, title, effectiveDate, serviceIds, bundleIds }` | На эту дату уже запланировано изменение этих услуг |
| `SERVICE_PRICE_CHANGE_LIMIT` | 409 | `{ max }` | Запланировано слишком много изменений |
| `SERVICE_PRICE_CHANGE_NOT_SCHEDULED` | 409 | `{ status }` | Изменение уже применено или отменено |
| `SERVICE_PRICE_CHANGE_NOT_APPLIED` | 409 | `{ status }` | Вернуть можно только применённое изменение |
| `SERVICE_PRICE_IMPORT_FILE_INVALID` | 400 | `{ reason, sheet?, columns? }` | по `reason`: «Загрузите файл», «Нужен файл .xlsx», «Файл не читается», «В файле нет колонок: …», «В файле нет строк», «Больше 2000 строк на листе» |
| `SERVICE_PRICE_IMPORT_FILE_TOO_LARGE` | 413 | - | Файл больше 5 МБ |
| `SERVICE_PRICE_IMPORT_INVALID` | 400 | `{ errorCount, errors }` | В файле есть ошибки |
| `SERVICE_PRICE_IMPORT_SERVICE_ACCESS` | 403 | `{ newServicesCount }` | Нет права создавать услуги |

## Проверки

Unit:
- `PriceTimeline`: нет изменений; одно; два на разные даты (берётся последнее `<= date`); граница дня (визит в день
  `effectiveDate` - новая цена, накануне - старая); `null` у уровня (как базовая) и у личной цены (дальше уровень).
- `PriceBook`: цена по дате визита (запись сегодня на дату после изменения); `visit = null` - `today`; цепочка
  процентов (+10% с 1.01 от 50 = 55, +10% с 1.02 от 55 = 60.50 -> 61 с шагом 1); `BUNDLE` у FIXED и игнор у SUM;
  `priceRange` через дату изменения; `staffPriceKey`; DST-день.
- Предпросмотр: строки по `include`, `invalid` (0, отрицательная, максимум), `SET`, «было» с учётом раннего плана,
  `affectedBookingsCount`, `conflicts`.
- Создание: `selectedKeys`, `overrides` (`null` у `BASE` - ошибка), `STALE`, `EMPTY`, конфликт даты, «сейчас».
- Применение: идемпотентность (двойной вызов), `TARGET_DELETED`, `STAFF_NOT_ASSIGNED`, `BUNDLE_NOT_FIXED`, «было»
  фактическое.
- Откат: всё возвращено; строка с ручной правкой после - `CHANGED_AFTER`; удаление цены уровня и возврат; статусы.
- Импорт: синонимы заголовков, числа с запятой и пробелами, все коды ошибок строк, новые категории, пусто в уровне
  у строки с ID, пусто в личной цене, лист «Личные цены» отсутствует, лимиты; экспорт -> импорт без правок даёт
  0 изменений.
- Фоновая задача: пояс филиала (UTC+3 в 21:30 UTC - уже завтра), ошибка одного изменения не останавливает остальные.

Временный e2e на реальной PostgreSQL (не коммитится, как `booking-history.e2e-spec.ts`):
1. Изменение +10% с завтра: превью слотов на завтра - новая цена, на сегодня - старая; запись на завтра создана
   по новой цене до применения; задача применяет (сдвиг часов), `Service.price` новая, запись не изменилась.
2. Два изменения на соседние даты - цепочка процентов; третье на ту же дату с той же услугой - 409.
3. «Сейчас» с уровнями, личными ценами и комплексом FIXED; ручная правка одной цены; откат - `CHANGED_AFTER` у неё,
   остальные вернулись.
4. Импорт: выгрузка -> правка цены, новая строка с новой категорией, пустая личная цена -> предпросмотр ->
   подтверждение с датой: услуга создана сразу, цены запланированы; отмена; откат загрузки «сейчас» не удаляет услуги.
5. Удаление мастера с запланированной личной ценой: применение - `TARGET_DELETED`, история читается.

## Фронт

| Экран | Эндпоинты |
|---|---|
| «Услуги», меню «Цены» в шапке рядом с «Категориями» (`pricing:read`; пункты записи - `pricing:write`) | «Выгрузить в Excel» - `GET service-prices/export`; остальные открывают диалоги ниже |
| Диалог «Изменить цены с даты» | `POST service-price-changes/preview` (при каждой правке условий, с задержкой), `POST service-price-changes`; 409 `STALE` - повторить превью, `DATE_CONFLICT` - показать изменение из payload |
| Диалог «Загрузить из Excel» | `GET service-prices/template` («Скачать шаблон»), `POST service-prices/import/preview`, `POST service-prices/import` (тот же файл); после - ссылка «N новых услуг без мастеров» (фильтр «без мастеров» в списке услуг) |
| «История изменений цен» (новый маршрут `paths.dashboard.services.priceChanges`) | `GET service-price-changes` |
| Карточка изменения (диалог или страница) | `GET service-price-changes/:id`, `POST .../cancel`, `POST .../rollback` (ответ - список «Не возвращены: цена менялась после») |
| Плашка в «Услугах» «С 1 января изменятся цены N услуг» -> история | `GET service-price-changes/upcoming` (`next`) |
| Подсказка у цены в таблице услуг и в карточке услуги «С 1 января: 55 BYN» | `GET service-price-changes/upcoming` (`services`, `bundles`) |
| Заглушка «Изменение цен с даты» в «Ценах и акциях» | ведёт в «Услуги» с открытым диалогом |

- Ключи запросов: новая сущность `entities/service-price-change` (`servicePriceChangeKeys.all/lists/list/detail/upcoming`).
  Создание, отмена, откат и загрузка сбрасывают её ключи, а также ключи услуг, комплексов, матрицы уровней, личных
  цен и `services/:id/prices`.
- Таблица услуг и карточка услуги не перестраиваются: добавляются только меню, плашка и подсказка.

## Уточнения реализации

- Вторая миграция `20261127130000_pricing_price_change_skip_default`: причина пропуска `LEVEL_IS_DEFAULT` - уровень
  стал уровнем по умолчанию после планирования (у такого уровня нет своих цен). Такие строки не применяются,
  не откатываются и не попадают в снимок цен.
- Снимок читает запланированные изменения через `ScheduledPriceChangeReadService`; запись цен - `ServicePriceChangeStore`
  (пакетный SQL по четырём таблицам цен, строки целей блокируются `FOR UPDATE`, поэтому решение «цена менялась после»
  и запись согласованы с ручной правкой).
- Внутри транзакции под блокировкой филиала все чтения (предпросмотр, каталог, уровни, назначения, число записей,
  пересечения) идут через ту же транзакцию.
- Фоновая задача при ошибке изменения останавливает этот филиал до следующего запуска: более поздние изменения не
  применяются раньше упавшего.
- `upcoming`: `next.changeIds` (изменения ближайшей даты), `services[].changeId`, `bundles[].changeId`; изменения
  с датой не позже сегодня филиала (ещё не перенесённые задачей) не показываются.
- Список истории возвращает `counts { all, SCHEDULED, APPLIED, CANCELLED, ROLLED_BACK }` по филиалу для вкладок.
- `booking-setup`: `listPrice` услуги считается на дату визита, если она известна, иначе на сегодня.
- Импорт: имя файла декодируется из latin1 в UTF-8 и обрезается до 255; лист без названия «Цены» - берётся первый;
  больше 10 000 строк - 400 `SERVICE_PRICE_CHANGE_TOO_LARGE`; ошибки в ответе - первые 200; шум float из Excel
  (55.00000000000001) округляется до копеек, настоящий третий знак - `PRICE_INVALID`. Право `service:write`
  проверяется через `hasPermission` (отдельного `AccessFacade` нет).
- CORS кабинета отдаёт `Content-Disposition`, фронт берёт имя файла выгрузки с сервера.
- Предел цены в режиме «Новая цена» - `PRICE_MAX_MINOR` (99 999 999,99).
