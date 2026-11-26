# Цены и акции, этап 7: товары - контракт

Источник правды для бэкенда (crm-core) и кабинета (crm-frontend) на время этапа 7. Решения: [план](./pricing-plan.md),
разделы 2.1, 3.3-3.6, 5.2 и раздел 7 «Решения этапа 7» (обязательны, здесь не пересматриваются). Форматы - как в
[контракте этапа 4](./pricing-stage4-api.md) и [этапа 6](./pricing-stage6-api.md): деньги в DTO - строки с двумя знаками,
проценты - строки с двумя знаками (`"10.00"`), количество - строка с тремя знаками (как сейчас), даты - `YYYY-MM-DD`
в поясе филиала, время дня - `HH:mm`. Заказы, возвраты, оплаты, идемпотентность - [orders.md](./orders.md). Имена полей ниже -
договорённость; если существующий DTO уже называет то же самое иначе, остаётся существующее имя, а этот файл правится.
Публичная страница, виджет и публичный каталог товаров не меняются: цены товаров там не считаются через ядро
(`PublicProductCatalogDto.retailPrice` - текущая розничная цена, как сейчас).

Правило проекта: прода нет, совместимость не нужна. Переименования ниже делаются целиком, без старых полей и флагов.

## Решения этапа

### Что считается

- Строка товара (`OrderItem` с `type = PRODUCT`) считается ядром цен. Слои строки:
  `baseUnitPrice` (розничная цена филиала на дату продажи с учётом плановых изменений) = `listUnitPrice` (наценок, уровней
  и личных цен у товаров нет) → одна лучшая скидка на строку (акция или скидка клиента на товары) → своя цена
  (`customUnitPrice`) → округление филиала.
- Скидка считается **на строку** (а не на единицу), потому что количество бывает дробным (мл, г):
  - `listLineTotal = quantize(quantity × listUnitPrice)` (half-up, как сейчас `priceLine`);
  - `PERCENT`: `raw = listLineTotal - round_half_up(listLineTotal × value / 100)`;
  - `AMOUNT`: у товара с `unit = PIECE` - `value × quantity` (скидка «на каждую штуку»), у весовых и объёмных
    (`GRAM`, `KILOGRAM`, `MILLILITER`, `LITER`) - `value` один раз на строку;
  - цена строки со скидкой `= min(listLineTotal, roundDown(raw, шаг филиала))`, не ниже 0;
    `discountTotal = listLineTotal - цена со скидкой`. Округление вниз - как у услуг (клиент получает не меньше обещанного),
    отдельного слоя `ROUNDING` нет.
- Деньги строки (существующие поля, смысл уточняется): `unitPrice = customUnitPrice ?? listUnitPrice`,
  `lineSubtotal = quantize(quantity × unitPrice)`, `discountTotal` - скидка строки (0 при своей цене), `lineTotal =
  lineSubtotal - discountTotal`. Это то, что уже читают оплаты, долг визита, зарплата и аналитика товаров.
- Кандидаты скидки строки: подходящие акции + персональная скидка клиента на товары (`CLIENT_DISCOUNT`). Побеждает большая
  скидка в деньгах, при равенстве скидка клиента, затем раньше созданная акция (как у услуг). Скидки не складываются.
  При своей цене кандидатов нет.
- Выбор скидки строки администратором - как у позиции записи: `promotion: { mode: AUTO | NONE | RULE | CLIENT_DISCOUNT,
  ruleId? }`, хранится в строке (`OrderItem.discountChoice`, `discountChoiceRuleId`). `NONE`, `RULE`, `CLIENT_DISCOUNT` и
  любая смена сохранённого выбора, где старый или новый выбор не `AUTO`, - только с `sale.price.override:write`, иначе 403.
  Не передано - сохранённый выбор остаётся.

### Контекст строки

| | Товар в записи (заказ визита, предпросмотр окна записи) | Отдельная продажа (`Order.bookingId = null`) |
|---|---|---|
| Дата и минута для расписания акции и даты цены | начало визита (`Booking.startAt`) в поясе филиала | момент продажи (см. ниже) в поясе филиала |
| Канал | канал записи: `PUBLIC_PAGE`, `WIDGET` → `ONLINE`, `MANUAL` → `ADMIN` | `ADMIN` |
| Клиент | клиент записи; «новый» - как у услуг этой записи (неотменённые записи бренда, созданные до неё) | клиент продажи (`Order.clientId`); «новый» - нет неотменённых записей в бренде и нет других проведённых продаж бренда (ACTIVE-заказ с CONFIRMED товарной строкой); импортированный - никогда; без клиента - неизвестный клиент (только акции `ANY`, без скидки клиента) |
| Промокод | `Booking.promoCode` | `Order.promoCode` (поле формы продажи) |
| Период записи (`bookingFrom`/`bookingTo`) | дата создания записи (`Booking.createdAt`) | дата продажи |
| Срок до визита (`minLeadMinutes`/`maxLeadMinutes`) | от `Booking.createdAt` до `Booking.startAt` (как при создании записи) | у продажи визита нет: акция с любым условием срока не применяется, причина `NO_VISIT` |
| Условие «Мастера» | продавец строки (`sellerStaffId`); без продавца - `WRONG_STAFF` | то же |

- Момент продажи: для `POST /orders` с `confirmImmediately: true` - `occurredAt` запроса (по умолчанию сейчас); во всех
  остальных случаях (черновик, предпросмотр, `POST items/confirm`) - сейчас, потому что проведение черновика ставит
  `confirmedAt = now`.
- Минимальная сумма визита (`minVisitTotal`) у товарной строки сравнивается с суммой по прайсу «визита или продажи»:
  сумма `listLineTotal` всех неотменённых товарных строк заказа (черновые, которые сейчас считаются, плюс уже проведённые) и,
  для заказа визита, сумма `listPrice` позиций записи (в предпросмотре окна записи - только что посчитанные позиции).
  **У услуг ничего не меняется**: их `minVisitTotal` по-прежнему смотрит только на услуги записи, цены услуг фиксируются при
  создании и от товаров не пересчитываются.

### Лимиты и промокод

- Использование акции - **визит или продажа**:
  - запись (не отменённая, не удалённая), у позиции которой есть `PROMOTION` с этим `ruleId`, **или** в заказе которой есть
    CONFIRMED товарная строка с `PROMOTION` этой акции - одно использование, сколько бы строк ни было;
  - отдельная продажа (ACTIVE-заказ без записи) с CONFIRMED товарной строкой с этой акцией - одно использование.
  - Черновые строки не считаются (цена ещё не зафиксирована). Возврат использование не восстанавливает (строка остаётся
    CONFIRMED). Аннулирование продажи (строки REVERSED) - использования нет, как у отменённой записи.
- Лимит на клиента считается по клиенту записи / продажи; окно периода - вокруг даты визита / даты продажи (±365/30/7 дней,
  как в этапе 4).
- Свой заказ (и его запись) в лимиты не входит: товар записи с той же акцией, что и услуги, использования не добавляет.
- Проведение проверяет лимиты свежими данными под блокировкой строк правил (`FOR UPDATE`, как при создании записи). Акция,
  чей лимит исчерпан, просто не применяется, и срабатывает сверка `expectedTotal` (409 `PRICE_CHANGED`).
- Промокод отдельной продажи хранится в `Order.promoCode` **как введён** (верхний регистр, обрезка пробелов), даже если сейчас
  не подходит: черновик пересчитывается при каждой записи и может начать подходить. Статус считается расчётом и отдаётся
  в предпросмотре (`promoCode: PromoCodeResultDto`).
- Промокод заказа визита - всегда `Booking.promoCode`; `promoCode` в записи заказа визита - 409 `ORDER_PROMO_CODE_VIA_BOOKING`.
  Правило этапа 4 «`Booking.promoCode` сохраняется, только если код `APPLIED`» остаётся, но `APPLIED` теперь считается по
  позициям **и** товарным строкам запроса (код только на товары сохранится, если в окне записи есть товар с этой акцией).

### Когда пересчитывается черновик

- Черновые товарные строки (DRAFT) хранят полный расчёт в своих полях и `OrderItemPriceAdjustment` (как строки услуг) и
  **пересчитываются при каждой записи, которая их касается**, в той же транзакции:
  - `POST /orders` (черновик), `PUT /orders/:orderId`, `POST /orders/:orderId/items`, `POST bookings/:id/items`,
    `POST bookings/:id/products`, создание записи с `products`;
  - запись записи, которая меняет её контекст: `PUT bookings/:id` со сменой времени начала, клиента, промокода, состава или
    цен позиций (сумма визита); синхронизация клиента записи с заказом;
  - проведение части строк (оставшиеся черновые строки пересчитываются после проведения).
- Пересчитываются **все** черновые строки заказа (минимальная сумма зависит от состава), с сохранённым выбором скидки
  (`fallbackToAuto`: выбранная акция, которая перестала действовать, даёт лучшую). Явно присланный в этом запросе выбор
  проверяется строго: неподходящий - 409 `PROMOTION_NOT_APPLICABLE`.
- Чтение (`GET`) не пересчитывает: показывает сохранённое. Свежую цену показывает предпросмотр.
- Проведённые (CONFIRMED) строки не пересчитываются никогда.

### Проведение

- Цена фиксируется при проведении: проводимые строки считаются заново свежими данными (`ReadConsistency.FRESH`) в
  транзакции проведения под блокировкой строк правил с лимитами, результат записывается в строку и её слои, затем
  склад, комиссия, статус - как сейчас.
- Каждое проведение принимает ожидаемую сумму проводимых строк (сумма `lineTotal`, которую видел пользователь). Другая
  сумма - 409 `PRICE_CHANGED` с новой раскладкой, транзакция откатывается целиком (оплата тоже). Фронт показывает новую
  цену и повторяет запрос с новой суммой.
- Своя цена строки при проведении сохраняется (как у записи).

### Возвраты

- Строка возврата получает долю **фактического** итога строки по количеству, кумулятивно (`MoneyUtils.allocateCumulative`):
  `lineTotal` и `discountTotal` распределяются по отдельности, `lineSubtotal = lineTotal + discountTotal`. Сумма всех
  возвратов строки ровно равна её `lineTotal`, `discountTotal` и `lineSubtotal`. Пересчёта по `listUnitPrice` больше нет.
- Возврат денег (`refund`), сторнирование комиссии продавца, итоги заказа - от `lineTotal` строки возврата (код не меняется,
  меняется значение).
- «К возврату: N BYN» - поле строки заказа `returnableAmount` (весь остаток) и предпросмотр возврата для частичного количества.

### Прочее

- «Цена ниже закупочной» - не блокирует. Закупочная цена - **последняя закупочная цена со склада**: `unitCost` строки
  проведённого (`POSTED`) документа `RECEIPT` этого `productLocationId` с непустым `unitCost`, самая поздняя по
  `InventoryDocument.occurredAt`, затем `postedAt`, затем `InventoryDocumentItem.position` (за единицу товара в его
  единице). Нет приходов - сравнения нет (`null`). `belowCost = lineTotal < quantize(lastPurchaseUnitCost × quantity)`.
- Закупочная цена числом - только пользователю с `Read(INVENTORY)` (сейчас закупочные цены видны только в складских экранах):
  без этого права `lastPurchaseUnitCost` (в предпросмотре продажи, предпросмотре акции, предпросмотре изменения цен товаров)
  всегда `null`, а `belowCost` / `belowCostCount` считаются и отдаются как обычно. Колонка «Последняя закупочная цена» в выгрузке
  Excel - только с `Read(INVENTORY)`, иначе колонки нет.
- Плановая смена цен товаров - как этап 6 (одна таблица изменений на оба каталога), меню «Цены» в «Товарах».
- Права - существующие: `pricing`, `order`, `order.return`, `sale.price.override`, `product.catalog`, `product.location`.
  Новых claim нет, `PERMISSIONS_VERSION` не меняется.

## Данные (миграция `20261128120000_pricing_products`)

```prisma
enum PriceRuleTargetType {
  SERVICE
  SERVICE_CATEGORY
  BUNDLE
  PRODUCT            // Product.id (товар бренда)
  PRODUCT_CATEGORY   // ProductCategory.id
}

model PriceRule {
  // было appliesToAll
  /// Every service and bundle except the excluded service-kind targets.
  appliesToAllServices Boolean
  /// Every product except the excluded product-kind targets. Promotions only (CHECK).
  appliesToAllProducts Boolean @default(false)
  ...
  orderDiscountChoices OrderItem[]
}

model Client {
  // было discountPercent
  /// Personal discount on services, percent in (0, 100]; null = none.
  servicesDiscountPercent Decimal? @db.Decimal(5, 2)
  /// Personal discount on products, percent in (0, 100]; null = none.
  productsDiscountPercent Decimal? @db.Decimal(5, 2)
}

model Order {
  /// Promo code of a sale as entered, upper case; null for a visit order (the booking holds it).
  promoCode String? @db.VarChar(32)
}

model OrderItem {
  /// Discount an administrator picked for a product line; null = AUTO. The rule only with RULE.
  discountChoice       DiscountChoiceMode?
  discountChoiceRuleId String?
  discountChoiceRule   PriceRule? @relation(fields: [discountChoiceRuleId], references: [id], onDelete: SetNull)
  @@index([discountChoiceRuleId])
}

// ServicePriceChange* -> PriceChange* (таблицы переименовываются, данные сохраняются)
enum PriceChangeCatalog { SERVICES PRODUCTS }
enum PriceChangeSource  { RULE IMPORT }
enum PriceChangeStatus  { SCHEDULED APPLIED CANCELLED ROLLED_BACK }
enum PriceChangeTarget  { BASE LEVEL STAFF BUNDLE PRODUCT }
enum PriceChangeSkip    { TARGET_DELETED STAFF_NOT_ASSIGNED BUNDLE_NOT_FIXED CHANGED_AFTER LEVEL_IS_DEFAULT NOT_FOR_SALE }

model PriceChange {
  // все поля ServicePriceChange без изменений, плюс:
  catalog       PriceChangeCatalog      // существующие строки - SERVICES
  productsCount Int @default(0)         // PRODUCTS: различных товаров в строках
  @@index([locationId, catalog, status, effectiveDate])
  @@index([locationId, catalog, createdAt])
}

model PriceChangeItem {
  // все поля ServicePriceChangeItem без изменений, плюс:
  productLocationId String?           // PRODUCT
  productLocation   ProductLocation? @relation(fields: [productLocationId], references: [id], onDelete: SetNull)
  @@index([productLocationId])
}
```

- `PriceRule`: `RENAME COLUMN "appliesToAll" TO "appliesToAllServices"`. CHECK `PriceRule_products_check`:
  `kind = 'PROMOTION' OR "appliesToAllProducts" = false`. Цели `PRODUCT`/`PRODUCT_CATEGORY` у наценки запрещает сервис
  (CHECK между таблицами нет).
- `Client`: `RENAME COLUMN "discountPercent" TO "servicesDiscountPercent"`; CHECK на новое поле - `(0, 100]`, как у старого.
- `ServicePriceChange` → `PriceChange`, `ServicePriceChangeItem` → `PriceChangeItem`, enum'ы - `ALTER TYPE ... RENAME`,
  `catalog` добавляется с `DEFAULT 'SERVICES'`, затем default снимается. CHECK строки (`..._target_check`) дополняется:
  `PRODUCT` - только `productLocationId` (может стать `null` после удаления), `afterPrice IS NOT NULL` и у `PRODUCT`;
  у остальных целей `productLocationId IS NULL`. CHECK изменения: `catalog = 'PRODUCTS'` - только цели `PRODUCT` (в сервисе).
- Комментарий `OrderItemPriceAdjustment.amount` меняется на «Signed change of the line total» (у услуг количество 1, смысл тот же).
  У товарной строки слои - только `PROMOTION` или `CLIENT_DISCOUNT`, одна строка на полную скидку строки, `value` - значение
  правила (у `AMOUNT` - за штуку или за строку, см. выше).
- `OrderReturnItem` не меняется: `discountTotal`, `lineSubtotal`, `lineTotal` получают значения по новому правилу.
- Обратные связи: `ProductLocation.priceChangeItems`, `PriceRule.orderDiscountChoices`, `Location.priceChanges`.
- Удаление товара или категории товаров (бренд): цели правил всех филиалов бренда удаляются (расширяется
  `PriceRuleTargetCleanupListener`, событие удаления товара / категории из `products`), правило остаётся.
- Данных для переноса нет.

### Переименования, которые касаются фронта

| Было | Стало |
|---|---|
| `Client.discountPercent` (ответ, создание, правка, импорт, выгрузка) | `servicesDiscountPercent` + новое `productsDiscountPercent` |
| `PriceRule.appliesToAll` (ответ, ввод, предпросмотр) | `appliesToAllServices` + новое `appliesToAllProducts` |
| `ClientDiscountStatsDto { bookingsCount, amount }` | `{ bookingsCount, salesCount, amount }` |
| Коды ошибок `SERVICE_PRICE_CHANGE_*` | `PRICE_CHANGE_*` (общие для услуг и товаров) |
| Коды ошибок `SERVICE_PRICE_IMPORT_FILE_INVALID`, `_FILE_TOO_LARGE`, `_INVALID` | `PRICE_IMPORT_FILE_INVALID`, `PRICE_IMPORT_FILE_TOO_LARGE`, `PRICE_IMPORT_INVALID` |
| `BookingItemPromotionDto` (тип в OpenAPI) | `PromotionChoiceDto` (переезжает в `pricing/dto`, форма `{ mode, ruleId? }` та же) |

Эндпоинты услуг этапа 6 (`service-price-changes`, `service-prices`) и их DTO не меняются, кроме кодов ошибок и
`DATE_CONFLICT` payload (`+ productIds: []`).

## Ядро (`pricing/engine`)

```ts
PricingSnapshot + products: PricingProductEntry[]
PricingProductEntry {
  productLocationId: string; productId: string;
  categoryId: string | null;           // ProductCategory
  unit: ProductUnit;
  retailPrice: number;                 // minor, текущее значение ProductLocation.retailPrice
}
PricingPriceChangeItem + productLocationId: string | null   // target PRODUCT; price не null
```

- В снимок попадают `ProductLocation` филиала с `retailPrice != null` и `product.isForSale = true` (любой статус: продаёт
  только то, что пропускает `ProductsService.resolveForSale`). Загрузчик читает и запланированные изменения обоих каталогов.
- Зависимости `PRICING_SNAPSHOT_CACHE` + `CacheDependency.brandProducts(brandId)`, `CacheDependency.locationProducts(locationId)`.
- `PriceTimeline`: ключ `PRODUCT:<productLocationId>`. Новый `PriceBook.productPriceAt(productLocationId, date): number`.
- `RuleTargetContext` + `kind: SERVICE | PRODUCT`, `productId`, `productCategoryId`. `RuleTargetSets` получает множества
  `products` и `productCategories`; `add` с неизвестным типом - `throw` (сейчас молча кладёт в комплексы). `CompiledRule`:
  `appliesToAllServices` действует только на контексты `SERVICE`, `appliesToAllProducts` - только на `PRODUCT`.
  Наценки на `PRODUCT`-контексты не применяются никогда (цели наценки товаров не бывают).
- Новый метод:

```ts
PriceBook.quoteProducts(request: ProductQuoteRequest): ProductsQuote

ProductQuoteRequest {
  lines: {
    productLocationId: string;
    quantityMilli: number;            // количество × 1000, целое
    customUnitPrice: number | null;   // minor
    sellerStaffId: string | null;
  }[];
  /** Дата и минута по таблице «Контекст строки»; дата цены - time.date. Null - акций нет. */
  time: VisitTime;
  /** Как QuoteContext этапа 4; choice - по индексу строки. visitStartMs = null у продажи (NO_VISIT). */
  context: QuoteContext | null;
  /** Сумма по прайсу остальных строк визита / продажи (услуги записи, проведённые товары), minor. */
  otherListTotal: number;
}
ProductLineQuote {
  productLocationId; productId;
  baseUnitPrice; listUnitPrice; listLineTotal;
  customUnitPrice: number | null;
  lineSubtotal; discountTotal; lineTotal;
  adjustments: PriceAdjustment[];     // 0 или 1 слой: PROMOTION | CLIENT_DISCOUNT, amount - на строку
  discount: PriceAdjustment | null;
  eligible: DiscountCandidate[];      // chargedPrice кандидата - lineTotal строки с этой скидкой
  ineligible: PromotionSkip[];
}
ProductsQuote { lines; listTotal; discountTotal; total; promoCode: PromoCodeResult | null }
```

- `QuoteClient` + `productsDiscountBp: number | null` (`discountBp` переименовывается в `servicesDiscountBp`). Кандидат
  `CLIENT_DISCOUNT` товарной строки берёт `productsDiscountBp`.
- Сумма визита для `minVisitTotal` товарной строки = `otherListTotal + Σ listLineTotal` строк запроса.
- Причина `PriceRuleSkipReason.NO_VISIT` (новая): условие срока до визита у продажи без визита. Проверяется на месте
  `LEAD_TIME_*` (порядок причин этапа 4 сохраняется).
- Промокод: результат по строкам товаров по алгоритму этапа 4. Окно записи объединяет результат услуг и товаров:
  `APPLIED` (хотя бы в одной из частей) > `BETTER_APPLIED` > `NOT_APPLICABLE` (причина - из услуг, если код там не подошёл,
  иначе из товаров) > `NOT_FOUND`.
- `PricingFacade` + `quoteProducts(locationId, request, consistency)` и `quoteProductsWithBook(book, request)` с тем же
  `assertChoices` (409 `PROMOTION_NOT_APPLICABLE { lineIndex, ruleId, reason, productId }`; сохранённый выбор с
  `fallbackToAuto` - без 409). Деньги на границе - `Prisma.Decimal`. Количество в `quantityMilli` переводит фасад.
- `explain` для товара: `PriceBook.explainProduct(line, time, context, otherListTotal)` - строка и все акции, которые до неё
  не дошли, с причиной (`notApplied`); наценки в списке не участвуют.
- Контекст расчёта (клиент, «новый», день рождения, скидки, счётчики лимитов, блокировка правил) переезжает из
  `bookings/services/booking-pricing-context.service.ts` в `pricing/services/pricing-context.service.ts`
  (`PricingContextService`, экспорт `PricingModule`; `PricingModule` импортирует `ClientsModule` и `ProductsModule`), потому
  что его зовут и записи, и заказы (`OrdersModule` импортирует `PricingModule`; `bookings` уже импортирует оба). Счётчик
  использований - один raw-SQL по правилу «Использование» выше. Запрос получает `orderId`/`bookingId`, которые исключаются.
- Последняя закупочная цена: `InventoryFacade.lastPurchaseUnitCosts(locationId, productLocationIds, tx?):
  Map<productLocationId, Decimal>` (одним запросом, `DISTINCT ON`).

## Кабинет: продажа и заказ

Префикс `locations/:locationId`. Общие DTO:

```ts
PromotionChoiceDto { mode: DiscountChoiceMode; ruleId?: string | null }   // ruleId обязателен только при RULE

OrderPriceAdjustmentDto { kind: PriceAdjustmentKind; ruleId: string | null; title: string; publicTitle: string | null;
                          valueType: PriceValueType | null; value: string | null; amount: string }   // amount со знаком, на строку

ProductPricingLineDto {                         // строка расчёта товара (предпросмотры)
  orderItemId: string | null;                   // строка заказа, если она уже есть
  productId: string; productLocationId: string;
  title: string; sku: string | null; unit: ProductUnit; quantity: string;
  sellerStaffId: string | null;
  baseUnitPrice: string; listUnitPrice: string; listLineTotal: string;
  customUnitPrice: string | null; unitPrice: string;
  lineSubtotal: string; discountTotal: string; lineTotal: string;
  adjustments: OrderPriceAdjustmentDto[];
  discount: BookingPricingDiscountDto | null;   // существующий DTO
  eligible: BookingPricingDiscountOptionDto[];  // chargedPrice - lineTotal строки с этой скидкой
  ineligible: BookingPricingPromotionSkipDto[];
  promotion: PromotionChoiceDto | null;         // выбор, с которым посчитано; null = AUTO
  lastPurchaseUnitCost: string | null;          // формат как unitCostSnapshot
  belowCost: boolean;
}
```

### Предпросмотр продажи - `POST orders/pricing` (`Read(ORDER)`)

Для формы продажи (новой и черновика), диалога «Добавить товары» в записи и страницы заказа. Ничего не пишет, цены через кэш.

```ts
OrderPricingRequestDto {
  orderId?: string | null;        // заказ, который правят (продажа или заказ визита): его контекст, его проведённые строки
  bookingId?: string | null;      // запись без заказа (или с заказом - тогда как orderId её заказа): контекст записи
  clientId?: string | null;       // только продажа; для заказа визита игнорируется
  occurredAt?: string;            // только новая продажа с немедленным проведением; иначе момент продажи - сейчас
  promoCode?: string | null;      // только продажа; undefined - Order.promoCode заказа (если orderId), null - без кода
  items: {                        // 0..200, полный желаемый набор черновых строк, как в PUT /orders/:orderId
    id?: string;                  // строка-черновик заказа (берётся её сохранённая своя цена и выбор скидки)
    productId: string; quantity: string;
    customUnitPrice?: string | null; sellerStaffId?: string | null;
    promotion?: PromotionChoiceDto;
  }[];
}
OrderPricingResponseDto {
  currency: string;
  context: SALE | BOOKING;        // enum OrderPricingContext
  items: ProductPricingLineDto[];
  listTotalAmount: string; subtotalAmount: string; discountTotal: string; totalAmount: string;   // по items
  promoCode: PromoCodeResultDto | null;
}
```

- `orderId` и `bookingId` вместе (с разными записями) - 400 `VALIDATION_ERROR`. Чужой или удалённый заказ / запись - 404
  `ORDER_NOT_FOUND` / `BOOKING_NOT_FOUND`. `promoCode` с контекстом записи - 409 `ORDER_PROMO_CODE_VIA_BOOKING`.
- `totalAmount` - это `expectedTotal` для «Продать» всего набора; для части строк - сумма их `lineTotal`.
- Ошибки строк - как у записи черновика: `ORDER_PRODUCT_NOT_SELLABLE`, `ORDER_SELLER_INVALID`, `ORDER_QUANTITY_INVALID`,
  `ORDER_QUANTITY_MUST_BE_WHOLE`, `ORDER_DUPLICATE_PRODUCT`; `promotion` не `AUTO` или своя цена без `sale.price.override` -
  403; неподходящий явный выбор - 409 `PROMOTION_NOT_APPLICABLE { lineIndex, ruleId, reason, productId }`.

### Запись черновика

- `OrderProductItemDto` (создание, `POST orders/:orderId/items`, `POST bookings/:id/items`, `POST bookings/:id/products`) и
  `UpdateOrderItemDto` + `promotion?: PromotionChoiceDto`.
- `CreateOrderDto`, `UpdateOrderDto` + `promoCode?: string | null` (3-32 символа, `A-Z 0-9 - _`, как у записи; `undefined` в
  `PUT` - без изменений, `null` - снять). У заказа визита - 409 `ORDER_PROMO_CODE_VIA_BOOKING`.
- Все черновые строки заказа пересчитываются (раздел «Когда пересчитывается черновик») и сохраняются: денежные поля,
  `discountChoice`, `discountChoiceRuleId`, слои `OrderItemPriceAdjustment` (заменяются целиком), итоги заказа
  (`refreshTotals`). Ответ не меняется (`{ id }`).
- Слияние при добавлении того же товара в черновик (`mergeDraftProductItem`) сохраняет `promotion`, если он не передан.

### Немедленная продажа - `POST orders` с `confirmImmediately: true`

- `CreateOrderDto` + `expectedTotal?: string` - **обязателен** при `confirmImmediately` (иначе 400 `VALIDATION_ERROR`),
  игнорируется без него. Это `totalAmount` предпросмотра.
- В транзакции: черновые строки создаются, считаются свежими данными (`FRESH`) под блокировкой правил с лимитами,
  `Σ lineTotal != expectedTotal` - 409 `PRICE_CHANGED`, иначе проведение и оплата как сейчас.
- `saleRequestHash` + `promoCode` (нормализованный), `items[].promotion` (`{ mode, ruleId }` или `null`), `expectedTotal`.
  Повтор с тем же ключом и тем же запросом возвращает заказ; после 409 ничего не сохранено, тот же ключ с новым
  `expectedTotal` - новый запрос (ключ свободен).

### Проведение черновика - `POST orders/:orderId/items/confirm` (`Write(ORDER)`)

- `ConfirmOrderItemsDto` + `expectedTotal: string` (обязателен) - сумма `lineTotal` проводимых строк, которую видел
  пользователь (из заказа или предпросмотра). Входит в hash операции.
- Проводимые строки пересчитываются свежими данными; 409 `PRICE_CHANGED` при расхождении; затем остальные черновые строки
  пересчитываются как при записи черновика.

### Товары записи

| Запрос | Новое поле | Правило |
|---|---|---|
| `POST bookings` (ручное создание) с `products` и `confirmProducts: true` | `expectedProductTotal: string`, обязателен при проведении товаров | сумма `lineTotal` товаров (`productTotal` предпросмотра окна записи) |
| `PUT bookings/:id` с `confirmProductItemIds` | `expectedProductTotal`, обязателен при непустом `confirmProductItemIds` | сумма `lineTotal` проводимых строк |
| `PUT bookings/:id/payment` с `confirmProductItemIds` | `expectedProductTotal`, обязателен при непустом списке | то же |

- `ManualBookingProductDto` + `promotion?: PromotionChoiceDto`.
- Товары записи считаются в контексте записи: при создании - по создаваемой записи (её время, канал, клиент, промокод).
  Лимиты при создании проверяются вместе по позициям и товарным строкам (`assertLimitsHeld` получает `ruleId` обеих частей).
- Расхождение - 409 `PRICE_CHANGED` (см. «Ошибки»), всё откатывается. `expectedProductTotal` входит в hash запроса там,
  где он есть (оплата визита).
- `expectedTotal` услуг (`PUT bookings/:id` с `RECALCULATE`) проверяется первым и не включает товары.

### Предпросмотр окна записи - `POST public/locations/:locationId/pricing`

- `products[]` считаются через `quoteProducts` в контексте записи: время `startAt`, канал по доступу (`ADMIN` из кабинета),
  клиент (`clientId` / `clientPhone`), `promoCode`, `products[].promotion` (кабинет), `bookingId` (её заказ: проведённые
  товары входят в сумму визита, своё использование не считается). `otherListTotal` - сумма по прайсу посчитанных позиций
  услуг плюс проведённые товары заказа записи.
- Товарные строки ответа получают `discount`, `eligible`, `ineligible`, `adjustments`, `promotion`, `lastPurchaseUnitCost`,
  `belowCost` (последние три - только кабинету, публичному запросу `null`/`false`). `productTotal`, `discountTotal`,
  `totalAmount` учитывают скидки товаров. `promoCode` - объединённый результат.

### Ответ заказа

```ts
OrderResponseDto + promoCode: string | null
OrderItemResponseDto + {
  adjustments: OrderPriceAdjustmentDto[];      // у услуг - слои записи, у товаров - скидка
  discount: OrderPriceAdjustmentDto | null;    // PROMOTION / CLIENT_DISCOUNT строки
  promotion: PromotionChoiceDto | null;        // сохранённый выбор товарной строки; null = AUTO
  returnedAmount: string;                      // Σ lineTotal проведённых (POSTED) возвратов строки
  returnableAmount: string;                    // CONFIRMED: lineTotal - returnedAmount; иначе "0.00"
}
```

### Возврат

- `POST orders/:orderId/returns` - тело не меняется, суммы строк по правилу «Возвраты».
- `POST orders/:orderId/returns/preview` (`Write(ORDER_RETURN)`), тело - `{ items: CreateOrderReturnItemDto[] }`, ответ:

```ts
OrderReturnPreviewDto {
  items: [{ orderItemId: string; quantity: string; lineSubtotal: string; discountTotal: string; lineTotal: string }];
  totalAmount: string;     // Σ lineTotal - «К возврату: N BYN»
  refundAmount: string;    // сколько денег вернётся при этом возврате (правило refund из orders.md); "0.00" - способ не нужен
}
```

  Проверки и ошибки - как у создания возврата (`ORDER_ITEM_NOT_FOUND`, `ORDER_STATUS_INVALID`, `ORDER_QUANTITY_INVALID`,
  `ORDER_QUANTITY_MUST_BE_WHOLE`, `ORDER_RETURN_QUANTITY_EXCEEDS_REMAINING`, `ORDER_DUPLICATE_ITEM`). Ничего не пишет.
  Одна и та же функция считает суммы в предпросмотре и в создании.

## Кабинет: акции

### Правило (`price-rules`)

```ts
PriceRuleInputDto: appliesToAll -> appliesToAllServices: boolean, + appliesToAllProducts?: boolean (по умолчанию false)
PriceRuleTargetInputDto.type: + PRODUCT | PRODUCT_CATEGORY
PriceRuleResponseDto: appliesToAllServices, appliesToAllProducts; targets[] с типами товаров и текущим именем
```

- Проверка целей (по видам отдельно): при `appliesToAllServices` цели-услуги (`SERVICE`, `SERVICE_CATEGORY`, `BUNDLE`) только
  `excluded: true`, иначе только включённые; то же для товаров с `appliesToAllProducts`. Должно быть что-то включено:
  `appliesToAllServices || appliesToAllProducts ||` хотя бы одна включённая цель. Нарушение - 400 `PRICE_RULE_INVALID
  { field: 'targets' }`.
- Наценка: `appliesToAllProducts = true` или товарные цели - 400 `PRICE_RULE_INVALID { field: 'targets' }`.
- `PRODUCT` - товар бренда филиала с `isForSale` и строкой `ProductLocation` в этом филиале; `PRODUCT_CATEGORY` - категория
  бренда. Чужие - 400 `PRICE_RULE_INVALID { field: 'targets' }`.
- `stats30d` акции: `amount` (скидки) и `revenue` включают товары нетто (за вычетом возвратов), `+ salesCount` (отдельные
  продажи с акцией за 30 дней по дате проведения). `price-rules/summary` + `sales30d`; `revenue30d`, `revenuePrev30d`,
  `discount30d` включают товары нетто.
- Условия для клиента (строка 1): «−15% на все услуги и товары», «−10% на все товары», «−15% на все товары, кроме: X»,
  «−15 BYN на Маникюр и Шампунь X» (цели услуг, затем товаров; до 3 названий, дальше «и ещё N»). Строка 7: акция только на
  товары - «Покупка от 40 BYN», иначе «Визит от 40 BYN». Строка 8: если у акции есть товары - «На услугу или товар
  действует одна скидка, самая выгодная».
- Публично: `booking-setup.promotions`, метки услуг и `GET public/.../promotions/:id` - только акции, которые достают хотя бы
  одну услугу или комплекс. Акция только на товары публично - 404 `PROMOTION_NOT_FOUND`, в кабинете у неё нет «Поделиться».

### Предпросмотр - `POST price-rules/preview`

Для акции дополнительно:

```ts
+ productCount: number; totalProductCount: number;      // охваченные / все продаваемые товары филиала
+ productExamples: [{ productId; productName; unit; before: string; after: string; amount: string;
                      lastPurchaseUnitCost: string | null; belowCost: boolean }];   // за 1 единицу (1 шт / 1 ед.)
+ belowCostCount: number;                               // охваченных товаров, у которых after < последней закупочной
matches30d + salesCount: number                         // discount включает товарные строки
```

- `productExamples` - до 5: сначала товары с `belowCost`, затем по названию. Пример - без условий клиента, периода, срока,
  мастеров, промокода, лимитов и суммы (как пример услуги).
- `matches30d.salesCount` - отдельные продажи за 30 дней (CONFIRMED товарные строки по `confirmedAt`), чьи строки подходят
  по целям, расписанию (момент продажи), каналу (`ADMIN`) и продавцу; `discount` - скидка по прайсу этих строк плюс услуги.
- `overlaps` учитывают общие товары: `example` - «Шампунь X» / «Все товары».

### Страница акции - `GET price-rules/:ruleId/report`

```ts
PromotionReportResponseDto + {
  servicesRevenue: string;                 // прежний revenue
  productsRevenue: string;                 // Σ lineTotal товарных строк с акцией минус их возвраты
  productsDiscount: string;                // Σ discountTotal строк минус discountTotal их возвратов
  productsReturned: string;                // Σ lineTotal возвратов этих строк
  salesCount: number;                      // отдельные продажи с акцией
  products: [{ productId: string; title: string; quantity: string; revenue: string; discount: string }];  // топ-20 по revenue, нетто
}
revenue = servicesRevenue + productsRevenue; discount = скидки услуг + productsDiscount
staff[] + productsRevenue: string          // по продавцу; мастер только с товарами - строка с bookingsCount 0
```

- Товарные строки периода: CONFIRMED строки с `PROMOTION` этой акции, `confirmedAt` в периоде, заказ ACTIVE (и записи, и
  отдельные продажи). Возвраты вычитаются все проведённые до текущего момента. `clientsCount` - различные клиенты записей и
  продаж. `newClients`, `returnedRate`, `notReturned` остаются по записям (как в этапе 4).
- Товарную часть считает новый `OrderPromotionReportService` в `orders` (`OrdersFacade`), отчёт в `bookings` её подключает.

### Проверка цены - `POST pricing/explain`

```ts
PriceExplainRequestDto + productId?: string;      // вместо serviceId / bundleId (ровно одно из трёх, иначе 400 VALIDATION_ERROR)
                       + quantity?: string;       // товар, по умолчанию "1"
                       + productContext?: SALE | BOOKING   // товар, по умолчанию SALE
PriceExplainResponseDto + kind: SERVICE | PRODUCT; + lastPurchaseUnitCost: string | null; + belowCost: boolean
```

- Для товара `staffId` - продавец; `date`/`time` - момент продажи или начало визита; `SALE` - канал `ADMIN`, условие срока
  не выполняется (`NO_VISIT`), `channel` игнорируется; `BOOKING` - `channel` и `bookedAt` как у услуги. `clientId` /
  `clientType`, `promoCode` - как у услуги; скидка клиента - на товары.
- Ответ товара: `line.basePrice = line.staffPrice` - розничная цена за единицу на дату; `line.listPrice` - `listLineTotal`
  (за `quantity`); `line.chargedPrice` - строка со скидкой, `line.total` - итог строки; `total` ответа = `line.total`;
  `candidates` пустой; `levelName` null; `notApplied` - только акции.

### Клиент

- `ClientResponseDto`: `servicesDiscountPercent: string | null`, `productsDiscountPercent: string | null`,
  `discountStats: { bookingsCount, salesCount, amount }` (`amount` - скидки `CLIENT_DISCOUNT` неотменённых записей и
  CONFIRMED товарных строк, без вычета возвратов).
- `CreateClientDto`, `UpdateClientDto`: `servicesDiscountPercent?`, `productsDiscountPercent?` (`0 < x <= 100`, `null` -
  снять, не передано - без изменений).
- Импорт и выгрузка клиентов: колонка «Скидка на услуги, %» (синонимы как у прежней «Скидка, %»: `скидка, %`, `скидка`,
  `discount`, ...) и новая «Скидка на товары, %» (`скидка на товары`, `products discount`).

## Кабинет: плановая смена цен товаров

Префикс `locations/:locationId`. Чтение - `Read(PRICING)`, запись - `Write(PRICING)`, как в этапе 6. Одна таблица
`PriceChange` на оба каталога; эндпоинты услуг читают `catalog = SERVICES`, эндпоинты товаров - `PRODUCTS`. Блокировка
филиала одна на оба каталога (`pg_advisory_xact_lock(hashtextextended('price-change:' || locationId, 0))`), фоновая задача
применяет изменения обоих каталогов по `effectiveDate`, `createdAt`.

Охват: товары филиала с `retailPrice != null` и `product.isForSale` (статусы `ACTIVE` и `INACTIVE`). Ключ строки -
`PRODUCT:<productId>`.

### `POST product-price-changes/preview` (`Read(PRICING)`)

```ts
ProductPriceChangeSpecDto {
  allProducts: boolean;              // true - все товары охвата; списки игнорируются
  productIds: string[];              // Product.id
  categoryIds: string[];             // ProductCategory.id
  mode: PERCENT | AMOUNT | SET;      // ServicePriceChangeMode -> переименовать в PriceChangeMode
  value: string | null;              // как в этапе 6; SET - новая цена всем выбранным
  priceRoundingStep: string;
  effectiveDate: string | null;
}
ProductPriceChangePreviewDto {
  date: string;
  rows: [{
    key: string; productId: string; productLocationId: string;
    title: string; sku: string | null; unit: ProductUnit;
    categoryId: string | null; categoryName: string | null; status: ProductStatus;   // статус в филиале
    before: string; after: string;
    invalid: boolean; checked: boolean;
    lastPurchaseUnitCost: string | null; belowCost: boolean;   // after < последней закупочной
  }];
  counts: { products: number; rows: number; changed: number; invalid: number; belowCost: number };
  conflicts: [{ changeId: string; title: string; effectiveDate: string; productIds: string[] }];
}
```

- Порядок строк: категория (`sortOrder`, без категории в конце), затем название. «Было», «станет», `invalid`, `checked`,
  даты, лимиты - как у услуг (`PERCENT`/`AMOUNT` округляются до ближайшего шага, `SET` не округляется; `after = 0` при
  `before > 0` - `invalid`). Пусто - 400 `PRICE_CHANGE_INVALID { field: 'scope' }`.

### `POST product-price-changes` (`Write(PRICING)`)

`ProductPriceChangeSpecDto + { selectedKeys: string[]; overrides: [{ key: string; price: string }] }` (цена не `null`).
Правила, транзакция, `STALE`, `EMPTY`, `ROW_INVALID`, конфликт даты (один товар в двух запланированных изменениях на одну
дату - 409 `PRICE_CHANGE_DATE_CONFLICT { changeId, title, effectiveDate, serviceIds: [], bundleIds: [], productIds }`),
лимит 50 запланированных **на каталог** - как в этапе 6. Ответ - `ProductPriceChangeDetailDto`.

### Применение, отмена, откат

- Применение `PRODUCT`: `ProductLocation.retailPrice = afterPrice`; `productLocationId = null` - `TARGET_DELETED`; товар
  больше не для продажи (`retailPrice IS NULL` или `isForSale = false`) - `NOT_FOR_SALE`. «Было» - фактическая цена перед
  записью. Сброс `pricing(locationId)` и `locationProducts(locationId)`.
- `POST product-price-changes/:changeId/cancel`, `POST product-price-changes/:changeId/rollback` - как у услуг: откат пишет
  «было», если текущая цена равна «станет», иначе `CHANGED_AFTER` / `TARGET_DELETED` / `NOT_FOR_SALE`. Ответ отката
  `{ change, restoredCount, skipped: ProductPriceChangeRowDto[] }`. Изменение другого каталога или чужого филиала - 404
  `PRICE_CHANGE_NOT_FOUND`.

### История

```ts
GET product-price-changes   // PaginationRequestDto + status?; порядок и counts - как у услуг
ProductPriceChangeSummaryDto {
  id; source: RULE | IMPORT; status; title; effectiveDate: string;
  ruleSpec: { mode; value: string | null; priceRoundingStep: string } | null;
  fileName: string | null;
  productsCount; itemsCount; applySkippedCount; rollbackSkippedCount;
  createdBy: { id; name } | null;
  createdAt; appliedAt; cancelledAt; rolledBackAt;
  canCancel: boolean; canRollback: boolean;
}
GET product-price-changes/:changeId
ProductPriceChangeDetailDto extends ProductPriceChangeSummaryDto { rows: ProductPriceChangeRowDto[] }
ProductPriceChangeRowDto {
  itemId; productId: string | null; productLocationId: string | null;    // null - товар удалён
  title: string; sku: string | null; categoryName: string | null;
  before: string; after: string; current?: string | null;               // current - только в ответе отката
  applySkip: PriceChangeSkip | null; rollbackSkip: PriceChangeSkip | null; rolledBack: boolean;
}
```

Заголовок изменения - формат этапа 6 (`+10%`, `Новые цены`, `Загрузка из Excel: <fileName>`).

### `GET product-price-changes/upcoming` (`Read(PRODUCT_CATALOG)` или `Read(PRODUCT_LOCATION)`)

```ts
ProductPriceUpcomingDto {
  next: { effectiveDate: string; changesCount: number; productsCount: number; changeIds: string[] } | null;
  products: [{ productId: string; effectiveDate: string; price: string; changeId: string }];   // ближайшая будущая цена
}
```

Как `service-price-changes/upcoming`: только даты позже сегодня филиала; строка, где ближайшая цена равна текущей, не выводится.

### Excel - только цены

Константы: `PRODUCT_PRICE_IMPORT_MAX_BYTES = 5 MB`, `PRODUCT_PRICE_IMPORT_MAX_ROWS = 5000`, ошибки в ответе - первые 200.
Лист **«Цены»** (ищется по имени, иначе первый лист):

| Колонка | Выгрузка | Загрузка |
|---|---|---|
| `ID` | `Product.id` | обязательно; пусто - ошибка `ID_REQUIRED` (загрузка не создаёт товары) |
| `Категория`, `Название`, `Артикул`, `Штрихкод`, `Единица` | из карточки товара | игнорируются |
| `Цена` | `retailPrice` филиала (Number, два знака) | новая цена; пусто - без изменения |
| `Последняя закупочная цена` | последняя закупочная, пусто - нет приходов | игнорируется |

- Выгружаются товары охвата: категория `sortOrder`, затем название. Синонимы заголовков (без регистра, `ё` = `е`):
  `ID` - `id`, `ид`; `Цена` - `розничная цена`, `price`; `Название` - `товар`, `name`. Обязательные колонки - `ID`, `Цена`.
  Числа - как в этапе 6.
- `ProductPriceImportRowError`: `ID_REQUIRED`, `ID_NOT_FOUND` (нет товара бренда со строкой в этом филиале), `DUPLICATE_ID`,
  `NOT_FOR_SALE` (товар только для своих нужд), `PRICE_INVALID` (не число, < 0, больше двух знаков, больше максимума).

| Эндпоинт | Право | Ответ |
|---|---|---|
| `GET product-prices/export` | `Read(PRICING)` | xlsx `product-prices-YYYY-MM-DD.xlsx` |
| `GET product-prices/template` | `Read(PRICING)` | xlsx `product-prices-template.xlsx`: тот же лист, что выгрузка (строки товаров нужны для ID, создавать товары загрузка не умеет); отличается только именем файла |
| `POST product-prices/import/preview` (multipart `file`, `effectiveDate?`) | `Write(PRICING)` | `{ date, rows: ProductPriceChangePreviewDto['rows'], errors: [{ row, column, code }], errorCount, counts: { products, rows }, conflicts, canApply }` |
| `POST product-prices/import` (тот же файл, `effectiveDate?`) | `Write(PRICING)` | `{ change: ProductPriceChangeSummaryDto \| null }`; ошибки строк - 400 `PRICE_IMPORT_INVALID` |

Ошибки файла - `PRICE_IMPORT_FILE_INVALID { reason }` (`MISSING`, `UNSUPPORTED_TYPE`, `CORRUPT`, `MISSING_COLUMNS`, `EMPTY`,
`TOO_MANY_ROWS`), 413 `PRICE_IMPORT_FILE_TOO_LARGE`. Без изменённых цен изменение не создаётся (`change: null`).

### Список товаров

- Колонка «Цена» - из существующего `GET brands/:brandId/products` (`locations[].retailPrice` активного филиала).
  Бэкенд не меняется. Подсказка «С 1 января: 55 BYN» и плашка - `product-price-changes/upcoming`.

## Аудит

| Сущность / событие | Когда | `payload` |
|---|---|---|
| `AuditEntity.PRODUCT_PRICE_CHANGE` (новая), шаблон `product_price_change.hbs`, «Изменение цен товаров» | | |
| `PRODUCT_PRICE_CHANGE_CREATED` («Изменение цен товаров запланировано») | создание с датой | `title, effectiveDate, productsCount` |
| `PRODUCT_PRICES_IMPORTED` («Цены товаров загружены из Excel») | подтверждение загрузки | `fileName, effectiveDate \| null, itemsCount` |
| `PRODUCT_PRICE_CHANGE_APPLIED` («Цены товаров изменены») | применение | `title, appliedCount, applySkippedCount` |
| `PRODUCT_PRICE_CHANGE_CANCELLED` | отмена | `title, effectiveDate` |
| `PRODUCT_PRICE_CHANGE_ROLLED_BACK` | откат | `title, restoredCount, rollbackSkippedCount` |
| `ORDER_CREATED`, `ORDER_UPDATED` | продажа | + `promoCode` (`{ before, after }` в `ORDER_UPDATED`, если изменился); снимок строки `orderItemSnapshot` + `discountTotal`, `discountTitle` |
| `ORDER_ITEM_CONFIRMED` | проведение | + `repricedItemIds` - строки, чья сумма при проведении отличалась от сохранённой в черновике |
| поля правила (`price-rule.fields`) | | `appliesToAllServices`, `appliesToAllProducts`, цели товаров |
| поля клиента (`client.fields`) | | `servicesDiscountPercent` («Скидка на услуги, %»), `productsDiscountPercent` («Скидка на товары, %») |

Тексты шаблонов - как у `service_price_change.hbs`. Названия - в `shared/i18n/ru.json`.

## Ошибки

Новые и изменённые значения `ErrorCode` (сообщения английские, русские тексты у фронта):

| Код | HTTP | Payload | Текст (фронт) |
|---|---|---|---|
| `PRICE_CHANGED` (есть) | 409 | товары: `{ expectedTotal, total, products: [{ orderItemId: string \| null, productId, title, quantity, listLineTotal, discountTotal, lineTotal }], promoCode }` | «Цена изменилась: было 51 BYN, стало 60 BYN» + кнопка «Продать за 60 BYN» |
| `PROMOTION_NOT_APPLICABLE` (есть) | 409 | `{ lineIndex, ruleId, reason, productId? }` (`productId` - у товарной строки) | Акция не подходит к этому товару |
| `ORDER_PROMO_CODE_VIA_BOOKING` (новый) | 409 | - | Промокод визита задаётся в записи |
| `PRICE_RULE_INVALID` (есть) | 400 | `{ field: 'targets' }` | Проверьте, к чему применяется правило |
| `PRICE_CHANGE_*`, `PRICE_IMPORT_*` (переименованы из `SERVICE_PRICE_*`) | как в этапе 6 | `DATE_CONFLICT` + `productIds` | тексты этапа 6; для товаров «На эту дату уже запланировано изменение этих товаров», «Больше 5000 строк на листе» |

- Отсутствующий `expectedTotal` / `expectedProductTotal` там, где он обязателен, - 400 `VALIDATION_ERROR`.
- Причина `NO_VISIT` (новая, в `notApplied`, `ineligible`, промокоде) - текст «только для записей заранее или в последний момент».
- Payload `PRICE_CHANGED` услуг не меняется (`items`). Фронт различает по наличию `products`.

## Проверки

Unit:
- Ядро `quoteProducts`: процент от строки; `AMOUNT` у `PIECE` × количество и один раз у весового; округление вниз по шагу на
  строку; не ниже 0; своя цена - без кандидатов; скидка клиента на товары против акции (равенство - скидка клиента);
  выбор `NONE`/`RULE`/`CLIENT_DISCOUNT`, `fallbackToAuto`; цели `PRODUCT`, `PRODUCT_CATEGORY`, `appliesToAllProducts` с
  исключением; акция «Все услуги» не трогает товары и наоборот; наценки к товарам не применяются; продавец и
  `WRONG_STAFF` без продавца; `NO_VISIT` у продажи; канал `ADMIN` продажи; `minVisitTotal` с `otherListTotal`; промокод
  (`APPLIED` только на товарах, объединение с услугами); цена по дате продажи через `PriceTimeline` (`PRODUCT`); снимок с
  товаром не для продажи.
- `RuleTargetSets.add` с неизвестным типом бросает ошибку.
- Проверка ввода правила: цели по видам, наценка с товаром - 400.
- Контекст: «новый» у продажи (запись, проведённая продажа, импорт), счётчик использований (запись + её товары = 1, продажа =
  1, черновик не считается, аннулированная продажа не считается, свой заказ исключён).
- Черновик: пересчёт всех черновых строк при записи; сохранённый выбор; права на выбор; `promoCode` заказа визита - 409.
- Проведение: `PRICE_CHANGED` при смене розничной цены и при исчерпанном лимите; совпадение - строки записаны свежими слоями.
- Возврат: три частичных возврата 1+1+1 из 3 шт со скидкой 10.00 - `discountTotal` 3.33, 3.33, 3.34; сумма `lineTotal`
  ровно равна строке; предпросмотр равен созданию; `returnableAmount`.
- Плановая смена цен товаров: предпросмотр, создание, конфликт даты, применение (`NOT_FOR_SALE`, `TARGET_DELETED`), откат
  `CHANGED_AFTER`; фоновая задача применяет оба каталога по порядку; импорт - коды строк, экспорт → импорт без правок даёт 0.
- Отчёт акции: товары нетто возвратов, `salesCount`, продавцы.

Временный e2e на реальной PostgreSQL (не коммитится, как `booking-history.e2e-spec.ts`):
1. Акция −20% на категорию товаров с лимитом 1: продажа с `expectedTotal` - строка со скидкой и слоем `PROMOTION`;
   вторая продажа - акция не применяется, со старым `expectedTotal` - 409 `PRICE_CHANGED`, с новым - проведена.
2. Запись с услугой по акции X (лимит 1) и товаром той же акции: товар получает X (одно использование); другая запись
   с товаром X - не получает.
3. Черновик продажи: смена розничной цены между черновиком и «Продать» - 409; пересчёт черновика при `PUT`.
4. Возврат 1 из 3 и ещё 2 из 3 со скидкой: суммы, `refund`, сторнирование комиссии продавца от `lineTotal` возврата.
5. Плановое изменение цены товара с завтра: предпросмотр продажи сегодня - старая цена, запись на завтра с товаром - новая;
   фоновая задача переносит; откат.
6. Excel товаров: выгрузка → правка цены → предпросмотр → подтверждение с датой → отмена.

## Фронт

| Экран | Что меняется | Эндпоинты |
|---|---|---|
| Форма продажи (новая и черновик) | строки считает сервер (итог в браузере больше не считается), у строки раскрытие с акцией, выбором скидки (`sale.price.override`), своей ценой; поле «Промокод» со статусом; «Цена ниже закупочной» у строки; «Продать» шлёт `expectedTotal`, 409 `PRICE_CHANGED` - «Цена изменилась: было N, стало M» и «Продать за M BYN» | `POST orders/pricing` (с задержкой при каждой правке), `POST orders`, `PUT orders/:id`, `POST orders/:id/items/confirm` |
| Страница заказа | у товарной строки скидка и раскладка, `promoCode` | `GET orders/:id` |
| Окно записи, товары | у товара выбор скидки как у услуги, предупреждение «ниже закупочной», итог со скидками товаров; проведение товаров шлёт `expectedProductTotal` | `POST public/locations/:locationId/pricing`, `POST bookings`, `PUT bookings/:id` |
| Диалог «Добавить товары» в записи | цены с акциями из предпросмотра | `POST orders/pricing` с `bookingId`, `POST bookings/:id/items` |
| Оплата визита с товарами | `expectedProductTotal`, 409 `PRICE_CHANGED` | `PUT bookings/:id/payment` |
| Диалог возврата | «К возврату: N BYN» и сумма денег к возврату | `POST orders/:id/returns/preview` (с задержкой при смене количества), `returnableAmount` |
| Редактор акции | в «К чему применяется» отметки «Все услуги» и «Все товары», выбор категорий товаров и товаров, исключения; в предпросмотре примеры товаров и «Цена ниже закупочной у N товаров»; у наценки товаров нет | `price-rules`, `POST price-rules/preview` |
| Список и страница акции | выручка с товарами, `salesCount`, блок «Товары», продавцы; нет «Поделиться» у акции только на товары | `GET price-rules`, `summary`, `report` |
| «Проверить цену» | выбор «Услуга / Товар», количество, продавец, «Продажа / Товар в записи» | `POST pricing/explain` |
| Карточка клиента | «Скидка на услуги, %» и «Скидка на товары, %» | клиенты |
| «Товары» | колонка «Цена» (активный филиал), меню «Цены»: «Изменить цены с даты», «Выгрузить цены в Excel», «Загрузить цены из Excel», «История изменений цен»; плашка «С 1 января изменятся цены N товаров»; подсказка у цены | `product-price-changes*`, `product-prices*`, `GET brands/:brandId/products` |

- Новая сущность `entities/product-price-change` (`productPriceChangeKeys.all/lists/list/detail/upcoming`). Создание, отмена,
  откат и загрузка сбрасывают её ключи и ключи товаров. Новый маршрут истории - `paths.dashboard.products.priceChanges`.
- Запись черновика и проведение сбрасывают ключи заказа и, для заказа визита, записи (оплата визита). Изменение акции
  сбрасывает ключи предпросмотров продажи.
- Переименования - таблица в разделе «Данные». Существующие экраны (форма продажи, окно записи, страница заказа, диалог
  возврата, «Товары», карточка клиента) не перестраиваются: добавляются только новые элементы (план, раздел 4.3).

## Уточнения реализации


### Клиент
- `discountStats`: `bookingsCount` - неотменённые записи, где `CLIENT_DISCOUNT` есть у позиции услуги или у CONFIRMED товарной
  строки заказа записи (визит считается один раз); `salesCount` - только отдельные ACTIVE продажи (`bookingId IS NULL`) с
  CONFIRMED товарной строкой со скидкой клиента; `amount` - сумма обоих источников без вычета возвратов.

### Плановая смена цен товаров и Excel
- Коды `SERVICE_PRICE_CHANGE_*` переименованы в `PRICE_CHANGE_*`, `SERVICE_PRICE_IMPORT_FILE_INVALID/FILE_TOO_LARGE/INVALID` - в
  `PRICE_IMPORT_*`; `SERVICE_PRICE_IMPORT_SERVICE_ACCESS` остаётся (только услуги). `ServicePriceChangeMode` -> `PriceChangeMode`
  (swagger `enumName: 'PriceChangeMode'`). Блокировка филиала - ключ `price-change:<locationId>`.
- Эндпоинты услуг читают только `catalog = SERVICES` (история, деталь, отмена, откат, upcoming); у конфликта услуг в ответе
  есть `productIds: []`.
- Предпросмотр товаров: пустой выбор (`allProducts = false` и пустые списки) - 400 `PRICE_CHANGE_INVALID { field: 'scope' }`;
  товар, который филиал не продаёт, - `{ field: 'productIds' }`; чужая категория - `{ field: 'categoryIds' }`; выбор без
  товаров даёт пустой предпросмотр, как у услуг. `counts.products` = числу строк (одна строка на товар); `counts.belowCost` -
  по всем строкам, не только отмеченным.
- `lastPurchaseUnitCost` - строка с 8 знаками (`UnitCostUtils.format`, как в предпросмотре продажи).
- Строки истории товаров: `title` - название на момент создания, `sku`/`categoryName` - текущие; сортировка: категория по
  имени (без категории в конце), затем название; `productId`/`productLocationId` = null, если строка товара в филиале удалена.
- `upcoming`: товар, который филиал больше не продаёт, не попадает в `products`, но учитывается в `next.productsCount`.
- Загрузка товаров: ID сравнивается без регистра; строка без ID и без цены пропускается, строка с ценой без ID -
  `ID_REQUIRED`; `NOT_FOR_SALE` - товар не для продажи или без розничной цены в филиале; на строку одна ошибка, ошибки ID
  важнее `PRICE_INVALID`; цена 0 допустима (как у услуг). В предпросмотре только строки, где цена меняется относительно цены
  на дату, `counts.products = counts.rows`. Ошибка файла: `PRICE_IMPORT_FILE_INVALID { reason, columns? }` без `sheet`; файл
  без строк - `EMPTY`.
- Шаблон `product-prices-template.xlsx` - тот же лист, что выгрузка, с колонкой закупочной цены при `Read(INVENTORY)`.
  Колонка «Единица» - короткие обозначения (шт, г, кг, мл, л).
- Аудит товаров: `PRODUCT_PRICE_CHANGE_CREATED { title, effectiveDate, productsCount }`; `PRODUCT_PRICES_IMPORTED { title,
  fileName, effectiveDate | null, itemsCount }` пишется всегда, при загрузке без даты ещё и `PRODUCT_PRICE_CHANGE_APPLIED`;
  для загрузки с датой `CREATED` не пишется.
- Проверка даты загрузки - общее правило: несуществующая дата (`2027-02-30`) - 400 `PRICE_CHANGE_DATE_INVALID` и для услуг
  (раньше могла дать 500).

### Акции
- Товарную часть отчёта акции, `stats30d`, `summary` и `matches30d` считает `PromotionProductStatsService` в `pricing`
  (`PricingCabinetModule`, чтение `OrderItem`, `OrderItemPriceAdjustment`, `OrderReturnItem`); `PriceRulesController`
  объединяет её с отчётом записей из `bookings`.
- `clientsCount` отчёта - различные клиенты записей и продаж; `returningClients = clientsCount - newClients`. `avgDiscount`,
  `staff[].revenue` и `staff[].discount` - по позициям записей. Порядок `staff`: `bookingsCount`, `productsRevenue`, имя.
- Товарные строки отчёта: CONFIRMED, заказ ACTIVE, `confirmedAt` в [начало периода, сейчас]; строки заказа записи - при любом
  статусе записи; вычитаются возвраты POSTED. `products[].productId` - `OrderItem.catalogItemId`, `title` - название в строке.
- `usageCount` («34 из 100») - визиты и отдельные продажи с акцией за всё время, каждое один раз (как счётчик лимитов).
- `stats30d.salesCount` у наценки - `null`, как `revenue`.
- Предпросмотр: `productExamples` за 1 единицу товара на `nextDate` в минуту начала первого интервала (без интервалов - 12:00);
  без `nextDate` - `productExamples: []`, `belowCostCount: 0`. `belowCost = after < quantize(закупочная)`. У наценки:
  `productCount 0`, `totalProductCount` - все продаваемые товары, `productExamples []`, `belowCostCount 0`.
- `matches30d.salesCount` - только отдельные продажи и только если в каналах акции есть ADMIN; скидка - от
  `quantize(quantity × OrderItem.listUnitPrice)`; товары в записях в `matches30d` не входят.
- Условия для клиента: «−15% на все услуги и на Шампунь X»; с исключениями части разделяются «; на »; обе отметки «все» -
  «−15% на все услуги и товары, кроме: A и Шампунь X». Строка 7 - «Покупка от» у акции только на товары, иначе «Визит от»;
  строка 8 - «На услугу или товар действует одна скидка, самая выгодная», если акция достаёт товары.
- Акция «только на товары» = нет `appliesToAllServices` и нет включённой цели-услуги, категории или комплекса. Такая акция не
  попадает в `booking-setup` и подписи, её ссылка - 404 `PROMOTION_NOT_FOUND`.
- `pricing/explain` для товара: не продаётся в филиале - 409 `ORDER_PRODUCT_NOT_SELLABLE`; `quantity <= 0` или дробное у PIECE -
  400 `VALIDATION_ERROR`; продавец не из филиала - 404 `BOOKING_STAFF_NOT_FOUND`; `line.adjustments` - только слой скидки.
- Удаление товара или категории: событие `products.catalog-item-removed` (`{ brandId, kind: PRODUCT | CATEGORY, id }`,
  `emitAsync`); слушатель удаляет цели во всех филиалах бренда и сбрасывает кэш цен каждого затронутого филиала.
- i18n аудита: `appliesToAll` -> `appliesToAllServices`; `appliesToAllProducts` «На все товары»; `targets` - «Услуги, товары,
  категории, комплексы».

### Предпросмотр окна записи
- Товары окна записи без токена кабинета: `adjustments` пустой (в слое внутреннее название), `promotion` = null,
  `lastPurchaseUnitCost` = null, `belowCost` = false; скрытая акция у товара не сворачивается в цену, как у услуг (онлайн
  товары не продаются). С `bookingId` период записи акции товара считается от `Booking.createdAt`. Сумма визита для
  `minVisitTotal` товаров - сумма `listPrice` посчитанных позиций (по выбранным мастерам; без мастера - базовая цена).

### Возвраты
- `discountTotal` строки возврата распределяется кумулятивно с округлением вниз (`MoneyUtils.allocateCumulativeDown`),
  остаток - возврату, который закрывает строку (1+1+1 из 3 шт со скидкой 10.00: 3.33, 3.33, 3.34); `lineTotal` и
  себестоимость - кумулятивно half-up (`allocateCumulative`); `lineSubtotal = lineTotal + discountTotal`.

### Блокировки
- Порядок блокировок: ключ оплаты → строки правил с лимитами → запись → слоты → заказ. Пересчёт черновых товарных строк
  правила не блокирует (черновик - не использование); блокирует только проведение (`FRESH`), и запрос, который проводит
  товары (`items/confirm`, оплата визита, `PUT bookings/:id` с `confirmProductItemIds`, создание записи с
  `confirmProducts`), берёт её до записи и заказа.

### Промокод
- При правке записи `APPLIED` считается по позициям и черновым товарным строкам заказа визита в новом контексте (время,
  клиент, код); при создании - по позициям и товарам запроса.
- `pricing/explain` и промокод для товарных строк: порядок причин - `DISABLED`, затем цели (`EXCLUDED`, `NOT_TARGETED`), затем
  расписание (`OUT_OF_PERIOD` … `NOT_HOLIDAY_DATE`), затем условия акции. Акция только на услуги или на другие товары -
  `NOT_TARGETED` в любое время. Для услуг порядок этапа 3 не меняется.
- Проведение товаров (немедленная продажа, `items/confirm`, оплата визита, `PUT bookings/:id` с `confirmProductItemIds`,
  создание записи с `confirmProducts`) пересчитывает итоги заказа по проведённым строкам.

### Окно записи: «Любой сотрудник»
- Предпросмотр (`POST public/locations/:locationId/pricing`) считает строку услуги без мастера по мастеру, которого назначит
  создание записи с тем же запросом: те же мастера, свободное время, правило филиала (`anyStaffRule`), загрузка дня, личные
  цены и цены уровней, наценки и акции. Подбор - одна функция (`BookingSchedulingService.assignTeam`) для предпросмотра,
  создания и проверки цены. У строк услуг новые поля `items[].staffId`, `staffName`, `staffSource`: `REQUESTED` - мастер
  выбран в запросе; `ASSIGNED` - назначен правилом на `startAt` среди свободных, как при создании; `ESTIMATED` - правило без
  учёта расписания (нет `startAt`, или в это время никто не свободен - тогда создание на это время вернёт 409
  `BOOKING_NO_STAFF_AVAILABLE`). Если услугу никто не выполняет, строка считается по базовой цене, `staffId` = null. У товаров
  поля null. В запросе предпросмотра (кабинет) новые поля `isCustomTime` и `endAt` - как при ручном создании.
- `POST locations/:locationId/bookings/manual`: `preferredStaffIds` - мастера строк предпросмотра по порядку услуг; мастер
  берётся первым, пока свободен. `expectedTotal` - `serviceTotal` предпросмотра. Если правило дало другого мастера, запись не
  создаётся: при другой сумме - 409 `PRICE_CHANGED`, при той же сумме - 409 `BOOKING_STAFF_CHANGED`; тело у обоих
  `{ expectedTotal, total, items, promoCode }`, `items[].staffId/staffName` - пересчитанная команда. Без `expectedTotal` сумма
  не проверяется, без `preferredStaffIds` мастер не сверяется. Окно записи всегда шлёт оба поля.
- Команда параллельного комплекса в окне записи берётся из предпросмотра цены (тот же подбор и тот же контекст кабинета, что
  при создании); `booking-resolve` со временем окно больше не вызывает.
- Проверка цены выбирает мастера той же функцией подбора (у комплекса - один мастер на все услуги, по цене всего визита);
  ответ не изменился.

### Каталог окна записи в кабинете
- Каталог окна записи в кабинете берёт цены из нового `GET /locations/{locationId}/booking-setup` (права `booking:read` или
  `booking.own:read`). Ответ такой же, как у публичного `GET /public/locations/{locationId}/booking-setup`, плюс у каждой
  услуги и комплекса поля `listPriceFrom` и `listPriceTo`. В публичном setup, на странице записи и в виджете эти поля `null`,
  а `priceFrom`/`priceTo` не менялись.
- `listPriceFrom`/`listPriceTo` у услуги - самая низкая и самая высокая цена по прайсу у мастеров филиала, которые её делают:
  личная цена, иначе цена уровня, иначе базовая. Цены на сегодня филиала, без наценок и без акций. Если услугу никто не
  делает - её базовая цена. Комплекс FIXED: обе цены равны цене комплекса на сегодня. Комплекс SUM, параллельный или
  последовательный: сумма минимумов и сумма максимумов его услуг.
- Подпись в каталоге кабинета: одна цена, если минимум равен максимуму, иначе «от <минимум>».
