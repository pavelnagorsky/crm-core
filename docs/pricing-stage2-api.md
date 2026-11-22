# Цены и акции, этап 2: контракт API

Источник правды для бэкенда, кабинета, публичной страницы и виджета на время этапа 2.
Решения: [план](./pricing-plan.md), разделы 2.2, 2.3, 2.6, 7. Деньги во всех DTO - строки с двумя
знаками (`ApiPrice`), как везде.

## Решения этапа

- Цена мастера = личная цена (`StaffService.price`) ?? цена его уровня (`ServiceLevelPrice`) ?? базовая.
- Уровни необязательны. Ровно один уровень филиала базовый (`isDefault`): его цена - базовая цена услуги,
  строк `ServiceLevelPrice` у него нет. `Staff.priceLevelId = null` - базовый уровень.
- Первый созданный уровень становится базовым. Базовый уровень нельзя удалить, пока есть другие.
  Удаление уровня переводит его мастеров на базовый (`priceLevelId = null`), цены уровня удаляются.
- Кто какие услуги делает - только назначение услуг мастеру. В ценах уровня нет «Не выполняет».
- Комплекс FIXED - пакет: цена одна у любого мастера, уровни и личные цены на него не влияют.
  Комплекс SUM - сумма цен мастеров по позициям.
- «Любой мастер»: `Location.anyStaffEnabled`, `Location.anyStaffRule`. Порядок кандидатов:
  занят -> предпочтительный -> правило -> id. Правила:
  - `CHEAPER_AND_FREER`: цена по возрастанию, затем загрузка дня;
  - `LESS_LOADED`: загрузка дня, затем цена по возрастанию;
  - `PRICIER`: цена по убыванию, затем загрузка дня;
  - `ROUND_ROBIN`: кто дольше всех не получал запись (по `createdAt` последней позиции записи), затем загрузка.
  Одна чистая функция ранжирования используется и в слотах, и при создании записи.
- Публичное создание записи требует `expectedTotal`. Расхождение с пересчётом - 409 `PRICE_CHANGED`.
- Право `pricing` (филиал): владелец - чтение и запись, управляющий - чтение и запись по умолчанию,
  настраивается. `PERMISSIONS_VERSION` поднимается.
- Массовое заполнение цен уровня и округление - этап 3.

## Кабинет

Права: чтение - `pricing:read`, запись - `pricing:write`.

### Уровни мастеров

`GET /locations/:locationId/price-levels` -> `PriceLevelResponseDto[]` по `sortOrder`, затем `name`.

```
PriceLevelResponseDto { id, name, sortOrder: number, isDefault: boolean, staffCount: number }
```

`POST /locations/:locationId/price-levels` `{ name: string (1-60), sortOrder?: number }` -> `PriceLevelResponseDto`.
Первый уровень филиала создаётся базовым.

`PATCH /locations/:locationId/price-levels/:levelId` `{ name?, sortOrder?, isDefault?: true }` -> `PriceLevelResponseDto`.
`isDefault: true` делает уровень базовым, прежний базовый перестаёт быть базовым. Цены нового базового
уровня удаляются (его цена теперь базовая), мастера прежнего базового с `priceLevelId = null` остаются на базовом.

`DELETE /locations/:locationId/price-levels/:levelId` -> 204.

Ошибки: `PRICE_LEVEL_NOT_FOUND` 404, `PRICE_LEVEL_NAME_EXISTS` 409, `PRICE_LEVEL_DEFAULT_IN_USE` 409
(удаление базового при наличии других уровней).

### Цены услуги

`GET /locations/:locationId/services/:serviceId/prices` -> `ServicePricesResponseDto`

```
ServicePricesResponseDto {
  serviceId, basePrice,
  priceFrom, priceTo,                 // по мастерам, которые делают услугу; без мастеров - basePrice
  levels: ServiceLevelPriceDto[],     // все уровни филиала по sortOrder
  staff: ServiceStaffPriceDto[]       // мастера, которым назначена услуга, по имени
}
ServiceLevelPriceDto { levelId, name, isDefault, price: string | null, staffCount }
  // price: своя цена уровня; null - как базовая (у базового всегда null)
ServiceStaffPriceDto {
  staffId, name, avatarUrl: string | null, status,
  levelId: string | null, levelName: string | null,  // null - базовый уровень (имя базового, если уровни есть)
  levelPrice,                       // цена по уровню
  personalPrice: string | null,     // личная цена
  price                             // итог = personalPrice ?? levelPrice
}
```

`PUT /locations/:locationId/services/:serviceId/level-prices` `{ items: [{ levelId, price: string | null }] }`
-> `ServicePricesResponseDto`. Передаются только меняемые уровни. Цена у базового уровня - 400
`PRICE_LEVEL_DEFAULT_PRICE`.

`PUT /locations/:locationId/services/:serviceId/staff-prices` `{ items: [{ staffId, price: string | null }] }`
-> `ServicePricesResponseDto`. `null` сбрасывает личную цену. «Сбросить личные цены» - все мастера с `null`.
Мастер без этой услуги - 400 `STAFF_SERVICE_NOT_ASSIGNED`.

### Цены мастера

`GET /locations/:locationId/staff/:staffId/service-prices` -> `StaffServicePricesResponseDto`
`PUT /locations/:locationId/staff/:staffId/service-prices` `{ items: [{ serviceId, price: string | null }] }`
-> `StaffServicePricesResponseDto`. Услуга не назначена - 400 `STAFF_SERVICE_NOT_ASSIGNED`.

```
StaffServicePricesResponseDto { staffId, levelId: string | null, items: StaffServicePriceDto[] }
StaffServicePriceDto { serviceId, serviceTitle, basePrice, levelPrice, personalPrice: string | null, price }
```

### Сотрудник

`StaffResponseDto` + `priceLevelId: string | null`. `CreateStaffDto` / `UpdateStaffDto` + `priceLevelId?: string | null`
(чужой уровень - 404 `PRICE_LEVEL_NOT_FOUND`; базовый уровень сохраняется как `null`).
Изменение `serviceIds` больше не пересоздаёт привязки: личные цены сохраняются у оставшихся услуг.

### Филиал

`LocationResponseDto` + `anyStaffEnabled: boolean`, `anyStaffRule: AnyStaffRule`.
`UpdateLocationDto` + `anyStaffEnabled?: boolean`, `anyStaffRule?: AnyStaffRule`.
`AnyStaffRule = 'CHEAPER_AND_FREER' | 'LESS_LOADED' | 'PRICIER' | 'ROUND_ROBIN'`.

### Превью цены в окне записи

`POST public/locations/:locationId/pricing`: `BookingPricingRequestDto` + `staffId?: string`,
`staffAssignments?: StaffAssignment[]` (как при создании). Позиции считаются по цене выбранного мастера.
`items[].staffId` (уже есть) тоже учитывается.

## Публичная запись и виджет

`GET public/locations/:locationId/booking-setup`:
- `BookingSetupServiceDto` + `priceFrom`, `priceTo` (мин. и макс. цена среди мастеров, которые делают услугу
  и доступны онлайн; без мастеров - `price`). `price` остаётся базовой.
- `BookingSetupBundleDto` + `priceFrom`, `priceTo` (FIXED: обе = цена комплекса; SUM: суммы минимальных и
  максимальных цен позиций).
- `BookingSetupStaffDto` + `servicePrices: [{ serviceId, price }]` (цена мастера по каждой его услуге).
- Ответ + `anyStaffEnabled: boolean`.

`POST public/locations/:locationId/booking-resolve`:
- `BookingResolveStaffDto` (в `availableStaff` и `staffByService[].availableStaff`) + `price: string` -
  сумма цен позиций, которые этот мастер взял бы.
- `BookingResolvedItemDto` + `basePrice`, `staffPrice`, `listPrice`, `discountTotal`, `chargedPrice`.
- Ответ + `totalPrice: string | null` - точный итог, когда передан `startAt` (сумма `chargedPrice`).

`GET locations/:locationId/calendar/public/available-slots` (тот же URL и параметры):
- элемент слота `PublicAvailableSlotItemDto { time, price: string, staffIds: string[] }`:
  `price` - итог визита в это время по мастерам, которых назначит правило; `staffIds` - назначенные
  мастера по позициям в порядке позиций.

`POST public/locations/:locationId/bookings`: `PublicCreateBookingDto` + `expectedTotal: string` (обязательно,
итог, который видел клиент). Входит в хэш идемпотентности. Если пересчёт дал другую сумму:

```
409 PRICE_CHANGED, payload {
  expectedTotal, total,
  items: [{ serviceId, serviceTitle, staffId, staffName, price }]
}
```

Клиент видит «Цена изменилась», подтверждает и отправляет запрос заново с `expectedTotal = total`
(новый ключ идемпотентности).

## Тексты ошибок (кабинет)

| Код | Текст |
|---|---|
| `PRICE_LEVEL_NOT_FOUND` | Уровень не найден |
| `PRICE_LEVEL_NAME_EXISTS` | Уровень с таким названием уже есть |
| `PRICE_LEVEL_DEFAULT_IN_USE` | Базовый уровень нельзя удалить, пока есть другие уровни |
| `PRICE_LEVEL_DEFAULT_PRICE` | У базового уровня цена - базовая цена услуги |
| `STAFF_SERVICE_NOT_ASSIGNED` | Мастер не выполняет эту услугу |
| `PRICE_CHANGED` | Цена изменилась |
