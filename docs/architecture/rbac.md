# Роли и доступ к API

Исторический снимок до внедрения permissions, 2026-10-16. Прежние ограничения ниже больше не описывают текущий backend. Актуальные правила: [роли и defaults](./rbac-target.md), [проверки API](./rbac-permissions-map.md), [управление доступом](./rbac-contracts.md). Старый перечень сохранён для сравнения и включает 184 исходных HTTP-маршрута.

Пути указаны относительно адреса backend. Глобального префикса `/api` нет: `/api` используется для Swagger UI. `:brandId`, `:locationId`, `:id` и другие параметры заменяются идентификаторами соответствующих сущностей. Query-параметры и тела запросов здесь не перечислены полностью.

## Роли

| Уровень | Роль | Значение |
| --- | --- | --- |
| Платформа, `User.role` | `USER` | Обычный аккаунт; роль по умолчанию. Доступ к бизнесу определяется членством. |
| Платформа, `User.role` | `ADMIN` | Администратор платформы; обходит проверки бизнес-ролей в `assertBrandRole` и `assertLocationRole`. |
| Бренд или локация, `BusinessRole` | `OWNER` | Владелец в указанной области доступа. |
| Бренд или локация, `BusinessRole` | `MANAGER` | Управляющий в указанной области доступа. |
| Бренд или локация, `BusinessRole` | `STAFF` | Сотрудник в указанной области доступа. |

Платформенная и бизнес-роль существуют одновременно: например, `USER` + `OWNER` бренда. У одного пользователя могут быть разные роли в разных брендах и локациях. Профиль `Staff` и членство с ролью `STAFF` — разные сущности: само наличие профиля сотрудника не выдаёт права аккаунту.

Источник: [schema.prisma](../../src/database/schema.prisma).

## Владение и назначение ролей

| Правило / действие | Текущая реализация |
| --- | --- |
| Только один владелец бренда или локации | Ограничения нет. Модель допускает несколько пользователей с `OWNER`. |
| Хотя бы один владелец | Отдельной проверки или ограничения БД нет. |
| Несколько управляющих | Количество не ограничено. |
| Несколько ролей одного пользователя в одном бренде | В `BrandMembership` только одна запись на пару `userId + brandId`, следовательно одна роль. |
| Несколько ролей одного пользователя в одной локации | В `LocationMembership` только одна запись на пару `userId + locationId`. Дополнительно может действовать роль бренда. |
| Первоначальное назначение владельца | `POST /brands` создаёт бренд и первую локацию; создатель получает `OWNER` в обоих членствах. |
| Приглашение сотрудника | `POST /locations/:locationId/staff/:id/invitations` доступен владельцу. |
| Принятие приглашения | `POST /staff/invitations/accept` создаёт членство локации с `STAFF`. Выбора роли нет; существующее членство вызывает конфликт. |
| Назначение `MANAGER`, добавление совладельца, смена роли | Отдельного API нет. Наличие роли в enum не означает наличие сценария её назначения. |
| Передача владения, выход из членства, отзыв членства | Отдельного API нет. Защита последнего владельца в таких сценариях не реализована. |
| Назначение платформенного `ADMIN` | Отдельного API в текущих контроллерах нет. |

Источники: [создание бренда](../../src/modules/brand/brand.service.ts), [приглашения](../../src/modules/staff/staff.service.ts), [DTO приглашения](../../src/modules/staff/dto/create-invitation.dto.ts), [ограничения членства](../../src/database/schema.prisma).

## Как читать матрицу

- **Да** — роль проходит проверку доступа для указанного действия. **Нет** — роль не даёт доступ. **Условно** — действуют дополнительные ограничения, описанные в строке и примечаниях.
- Столбцы `OWNER`, `MANAGER`, `STAFF` относятся к пользователю с платформенной ролью `USER` и указанной бизнес-ролью. Если у пользователя есть несколько подходящих членств, учитывается их совокупность по правилам ниже.
- **Бренд** — требуется членство именно в `:brandId`. Членство только в одной локации не даёт доступ к обычным маршрутам бренда, даже с ролью `OWNER`.
- **Локация** — подходит роль конкретной локации либо её бренда. При выдаче access token роль бренда разворачивается на все его активные локации. Более низкая локальная роль не отнимает права, полученные через бренд.
- **Поставщики** — особая проверка: подходит роль бренда; дополнительно `MANAGER` любой локации этого бренда получает доступ ко всем перечисленным операциям поставщиков. Это не общее правило для других API бренда.
- Иерархии `OWNER > MANAGER > STAFF` в guard нет: допустимые роли перечислены явно. В текущих маршрутах владелец указан в каждом наборе бизнес-ролей.
- **`ADMIN` проходит все проверки бизнес-ролей в матрице без членства.** Для него сохраняются аутентификация, актуальность токена, проверки существования/активности сущностей, состояния документов и другие бизнес-условия. Он не получает автоматически клиентский токен бронирования, refresh token или доступ к чужому личному файлу через `/users/me`.
- Для обычного `USER` без подходящего членства бизнес-маршруты недоступны. Общие и публичные действия вынесены отдельно; они доступны независимо от бизнес-роли при выполнении указанного условия.
- «Да» не гарантирует успешное выполнение: например, слот может быть занят, документ нельзя менять в текущем статусе, а удалённый бренд недоступен.

Исторические источники: `assert-brand-role.ts`, `assert-location-role.ts`, `supplier-rbac.guard.ts` и `AuthService`. Старые guards удалены при переходе на `@Permissions`; актуальная схема описана в [rbac-target.md](./rbac-target.md).

## Дополнительные ограничения и особенности

### Заказы и произвольная цена

Guard контроллера заказов допускает все три бизнес-роли, но сервисы дополнительно ограничивают действия:

- Аннулирование заказа через `PATCH /locations/:locationId/orders/:orderId/status` разрешено только при `AuditActorRole.OWNER` или `SUPPORT`.
- При создании и редактировании заказа через `POST /locations/:locationId/orders` и `PUT /locations/:locationId/orders/:orderId` установка, изменение и сброс `customUnitPrice` товарной позиции требуют `OWNER` или `SUPPORT` в audit actor. Менеджер и сотрудник могут сохранять существующую произвольную цену без изменения; удаление позиции с такой ценой при замене состава заказа также может быть отклонено.
- **Добавление товаров работает иначе:** `POST /locations/:locationId/orders/:orderId/items`, `POST /locations/:locationId/bookings/:id/products` и `POST /locations/:locationId/bookings/:id/items` вызывают `resolveProductItemAdditions`, который не вызывает `assertCustomPriceAccess`. По текущему коду менеджер и сотрудник могут передать произвольную цену, если у соответствующей черновой позиции ещё нет такой цены. Если произвольная цена уже есть, `customPrice` сохраняет её для пользователя без прав владельца. Это расхождение текущей реализации, а не единое правило «любую произвольную цену меняет только владелец».
- Для `customPrice` услуг бронирования при ручном создании и изменении бронирования отдельной owner-проверки нет: действуют общие роли соответствующих маршрутов.
- `auditActorFromToken` преобразует платформенного `ADMIN` в `SUPPORT`, бизнес-владельца — в `OWNER`, остальных — в `STAFF`. При наличии членства бренда оно имеет приоритет над членством локации. Поэтому сочетание `MANAGER` бренда + `OWNER` локации проходит owner-проверку RBAC локации, но не проходит эти дополнительные проверки заказа. В обратном сочетании `OWNER` бренда + `MANAGER` локации права владельца сохраняются.
- Таким образом, `AuditActorRole` формально описывает участника аудита, но в текущем коде также используется для двух проверок доступа к заказам. Значения: `CLIENT`, `STAFF`, `OWNER`, `SUPPORT`, `SYSTEM`, `INTEGRATION`; это не назначаемые бизнес-роли.

Источники: [OrdersService.changeStatus](../../src/modules/orders/orders.service.ts), [OrderDraftService](../../src/modules/orders/services/order-draft.service.ts), [OrderBookingSyncService](../../src/modules/orders/services/order-booking-sync.service.ts), [BookingCreateService](../../src/modules/bookings/services/booking-create.service.ts), [BookingMutationService](../../src/modules/bookings/services/mutation/booking-mutation.service.ts), [auditActorFromToken](../../src/modules/audit/utils/audit-actor-from-token.ts).

### Область данных и токены

- Чтение зарплатных периодов, отчётов, начислений и условий оплаты разрешено также `MANAGER` и `STAFF`. В этих endpoints нет ограничения «только свои начисления»: идентификатор сотрудника не сверяется с текущим аккаунтом.
- `GET /brands` для `USER` выбирает бренды по `BrandMembership` из БД. Одного членства локации недостаточно для попадания бренда в этот список. Для `ADMIN` возвращаются все подходящие активные бренды.
- `@Auth()`, `@BrandRBAC()`, `@LocationRBAC()` и `@SupplierRBAC()` требуют access token и проверяют его epoch. Устаревший токен даёт `409 TOKEN_PAYLOAD_STALE` с требованием обновить access token.
- Отсутствие сопоставления локации в payload для обычного пользователя также даёт `409 TOKEN_PAYLOAD_STALE` (`LOCATION_MAPPING_MISSING`), а не обычный `403`. Это не выдаёт доступ; обновление токена не создаёт отсутствующее членство.
- Глобальный `BusinessActiveGuard` проверяет `brandId`/`locationId` из пути, в том числе на публичных маршрутах. Бизнес-роль не отменяет проверку активности бренда и локации.
- В мутациях бронирований часть проверок находится в `BookingMutationService`, поэтому одного просмотра декораторов контроллера недостаточно для определения прав.

Источники: [TokenEpochGuard](../../src/modules/auth/guards/token-epoch.guard.ts), [BusinessActiveGuard](../../src/shared/guards/business-active.guard.ts), [BookingMutationService](../../src/modules/bookings/services/mutation/booking-mutation.service.ts), [BrandService.search](../../src/modules/brand/brand.service.ts).

## Матрица бизнес-действий

Каждая строка соответствует одному HTTP-маршруту. Описание уточняет назначение действия и существенные ограничения сверх роли. Ссылки перед таблицами ведут на контроллеры, где объявлены маршруты.


### Бренды

Источники: [brand.controller.ts](../../src/modules/brand/brand.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Получить сведения о бренде. | `GET /brands/:brandId` | Бренд | Да | Да | Да |
| Изменить сведения о бренде. | `PUT /brands/:brandId` | Бренд | Да | Нет | Нет |
| Мягко удалить бренд с учётом политики удаления. | `DELETE /brands/:brandId` | Бренд | Да | Нет | Нет |

### Локации

Источники: [location.controller.ts](../../src/modules/location/location.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать локацию внутри бренда. | `POST /brands/:brandId/locations` | Бренд | Да | Нет | Нет |
| Получить список локаций бренда. | `GET /brands/:brandId/locations` | Бренд | Да | Да | Да |
| Получить сведения о локации. | `GET /locations/:locationId` | Локация | Да | Да | Да |
| Изменить настройки локации. | `PUT /locations/:locationId` | Локация | Да | Нет | Нет |
| Мягко удалить локацию с учётом политики удаления. | `DELETE /locations/:locationId` | Локация | Да | Нет | Нет |

### Клиенты

Источники: [clients.controller.ts](../../src/modules/clients/clients.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать клиента бренда. | `POST /brands/:brandId/clients` | Бренд | Да | Нет | Нет |
| Импортировать клиентов из XLSX. | `POST /brands/:brandId/clients/import` | Бренд | Да | Нет | Нет |
| Изменить карточку клиента. | `PUT /brands/:brandId/clients/:id` | Бренд | Да | Нет | Нет |
| Запретить или разрешить клиенту онлайн-запись. | `PATCH /brands/:brandId/clients/:id/ban` | Бренд | Да | Нет | Нет |
| Экспортировать клиентов в XLSX. | `GET /brands/:brandId/clients/export` | Бренд | Да | Да | Да |
| Получить карточку клиента. | `GET /brands/:brandId/clients/:id` | Бренд | Да | Да | Да |
| Найти клиентов с фильтрами и пагинацией. | `GET /brands/:brandId/clients` | Бренд | Да | Да | Да |

### Сотрудники и смены

Источники: [staff.controller.ts](../../src/modules/staff/staff.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать профиль сотрудника. | `POST /locations/:locationId/staff` | Локация | Да | Нет | Нет |
| Изменить профиль сотрудника. | `PUT /locations/:locationId/staff/:id` | Локация | Да | Нет | Нет |
| Количество сотрудников по статусам. | `GET /locations/:locationId/staff/status-counts` | Локация | Да | Да | Да |
| Экспортировать сотрудников в XLSX. | `GET /locations/:locationId/staff/export` | Локация | Да | Да | Да |
| Получить профиль сотрудника. | `GET /locations/:locationId/staff/:id` | Локация | Да | Да | Да |
| Найти сотрудников с фильтрами и пагинацией. | `GET /locations/:locationId/staff` | Локация | Да | Да | Да |
| Активировать или деактивировать сотрудника. | `PATCH /locations/:locationId/staff/:id/status` | Локация | Да | Нет | Нет |
| Удалить профиль сотрудника при выполнении бизнес-условий. | `DELETE /locations/:locationId/staff/:id` | Локация | Да | Нет | Нет |
| Получить смены сотрудника за период. | `GET /locations/:locationId/staff/:id/shifts` | Локация | Да | Да | Да |
| Заменить смены сотрудника в указанном диапазоне дат. | `PUT /locations/:locationId/staff/:id/shifts` | Локация | Да | Нет | Нет |
| Создать приглашение для привязки аккаунта к сотруднику. | `POST /locations/:locationId/staff/:id/invitations` | Локация | Да | Нет | Нет |

### Услуги, категории и комплексы

Источники: [services.controller.ts](../../src/modules/services/services.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать категорию услуг. | `POST /locations/:locationId/service-categories` | Локация | Да | Нет | Нет |
| Получить категории услуг локации. | `GET /locations/:locationId/service-categories` | Локация | Да | Да | Да |
| Изменить категорию услуг. | `PUT /locations/:locationId/service-categories/:categoryId` | Локация | Да | Нет | Нет |
| Удалить категорию услуг. | `DELETE /locations/:locationId/service-categories/:categoryId` | Локация | Да | Нет | Нет |
| Создать услугу. | `POST /locations/:locationId/services` | Локация | Да | Нет | Нет |
| Изменить услугу. | `PUT /locations/:locationId/services/:id` | Локация | Да | Нет | Нет |
| Получить счётчики единого каталога услуг и комплексов. | `GET /locations/:locationId/service-catalog/counts` | Локация | Да | Да | Да |
| Найти услуги и комплексы в едином каталоге. | `GET /locations/:locationId/service-catalog` | Локация | Да | Да | Да |
| Создать комплекс услуг. | `POST /locations/:locationId/service-bundles` | Локация | Да | Нет | Нет |
| Получить комплекс услуг. | `GET /locations/:locationId/service-bundles/:id` | Локация | Да | Да | Да |
| Изменить комплекс услуг. | `PUT /locations/:locationId/service-bundles/:id` | Локация | Да | Нет | Нет |
| Изменить статус комплекса услуг. | `PATCH /locations/:locationId/service-bundles/:id/status` | Локация | Да | Нет | Нет |
| Удалить комплекс услуг. | `DELETE /locations/:locationId/service-bundles/:id` | Локация | Да | Нет | Нет |
| Получить услугу. | `GET /locations/:locationId/services/:id` | Локация | Да | Да | Да |
| Изменить статус услуги. | `PATCH /locations/:locationId/services/:id/status` | Локация | Да | Нет | Нет |
| Удалить услугу. | `DELETE /locations/:locationId/services/:id` | Локация | Да | Нет | Нет |

### Календарь

Источники: [calendar.controller.ts](../../src/modules/calendar/api/calendar.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Получить слоты для ручной записи без ограничений видимости, минимального уведомления и горизонта онлайн-записи. | `GET /locations/:locationId/calendar/available-slots` | Локация | Да | Да | Да |
| Получить календарь за период: блокировки, бронирования и закрытое время. | `GET /locations/:locationId/calendar` | Локация | Да | Нет | Нет |
| Получить серию блокировки для редактирования. | `GET /locations/:locationId/calendar/:eventId` | Локация | Да | Нет | Нет |
| Создать блокировку для выбранных сотрудников или всей локации. | `POST /locations/:locationId/calendar` | Локация | Да | Нет | Нет |
| Переместить интервал блокировки на сетке календаря. | `PUT /locations/:locationId/calendar/:eventId/occurrence` | Локация | Да | Нет | Нет |
| Изменить блокировку; thisOnly позволяет изменить одно повторение. | `PUT /locations/:locationId/calendar/:eventId` | Локация | Да | Нет | Нет |
| Удалить блокировку или отменить отдельное повторение через thisOnly. | `DELETE /locations/:locationId/calendar/:eventId` | Локация | Да | Нет | Нет |

### Бронирования

Источники: [bookings.controller.ts](../../src/modules/bookings/bookings.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать бронирование вручную. | `POST /locations/:locationId/bookings/manual` | Локация | Да | Да | Да |
| Количество бронирований по статусам. | `GET /locations/:locationId/bookings/status-counts` | Локация | Да | Да | Да |
| Экспортировать бронирования в XLSX. | `GET /locations/:locationId/bookings/export` | Локация | Да | Да | Да |
| Получить бронирование в заданной локации. | `GET /locations/:locationId/bookings/:id` | Локация | Да | Да | Да |
| Найти бронирования с фильтрами и пагинацией. | `GET /locations/:locationId/bookings` | Локация | Да | Да | Да |
| Изменить бронирование; RBAC проверяется в BookingMutationService. | `PUT /locations/:locationId/bookings/:id` | Локация | Да | Да | Да |
| Изменить статус бронирования; допустимость перехода проверяется сервисом. | `PATCH /locations/:locationId/bookings/:id/status` | Локация | Да | Да | Да |
| Добавить одну черновую товарную позицию в заказ бронирования; особенности customUnitPrice описаны выше. | `POST /locations/:locationId/bookings/:id/products` | Локация | Условно | Условно | Условно |
| Добавить черновые товарные позиции в заказ бронирования; особенности customUnitPrice описаны выше. | `POST /locations/:locationId/bookings/:id/items` | Локация | Условно | Условно | Условно |
| Выпустить клиентский токен управления конкретным бронированием. | `POST /locations/:locationId/bookings/:id/client-token` | Локация | Да | Да | Да |
| Отменить бронирование от имени персонала; RBAC проверяется в сервисе. | `POST /locations/:locationId/bookings/:id/cancel` | Локация | Да | Да | Да |
| Удалить бронирование; в сервисе требуется OWNER и выполнение политики удаления. | `DELETE /locations/:locationId/bookings/:id` | Локация | Да | Нет | Нет |

### Заказы и возвраты

Источники: [orders.controller.ts](../../src/modules/orders/orders.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать заказ; установка customUnitPrice ограничена владельцем/ADMIN. | `POST /locations/:locationId/orders` | Локация | Условно | Условно | Условно |
| Найти заказы. | `GET /locations/:locationId/orders` | Локация | Да | Да | Да |
| Количество заказов по статусам. | `GET /locations/:locationId/orders/status-counts` | Локация | Да | Да | Да |
| Получить заказ с позициями. | `GET /locations/:locationId/orders/:orderId` | Локация | Да | Да | Да |
| Изменить заказ; нельзя устанавливать, менять или сбрасывать customUnitPrice без прав владельца/ADMIN. | `PUT /locations/:locationId/orders/:orderId` | Локация | Условно | Условно | Условно |
| Аннулировать заказ; сервис дополнительно требует audit actor OWNER или SUPPORT. | `PATCH /locations/:locationId/orders/:orderId/status` | Локация | Условно | Нет | Нет |
| Подтвердить одну черновую позицию заказа. | `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/confirm` | Локация | Да | Да | Да |
| Добавить черновые товарные позиции; особенности customUnitPrice описаны выше. | `POST /locations/:locationId/orders/:orderId/items` | Локация | Условно | Условно | Условно |
| Подтвердить несколько черновых товарных позиций. | `POST /locations/:locationId/orders/:orderId/items/confirm` | Локация | Да | Да | Да |
| Сторнировать подтверждённую позицию при допустимом состоянии. | `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/reverse` | Локация | Да | Да | Да |
| Оформить возврат товаров по активному заказу. | `POST /locations/:locationId/orders/:orderId/returns` | Локация | Да | Да | Да |
| Удалить активный черновой заказ при выполнении бизнес-условий. | `DELETE /locations/:locationId/orders/:orderId` | Локация | Да | Да | Да |

### Товары и категории

Источники: [products.controller.ts](../../src/modules/products/products.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать категорию товаров бренда. | `POST /brands/:brandId/product-categories` | Бренд | Да | Нет | Нет |
| Получить категории товаров. | `GET /brands/:brandId/product-categories` | Бренд | Да | Да | Да |
| Изменить категорию товаров. | `PUT /brands/:brandId/product-categories/:categoryId` | Бренд | Да | Нет | Нет |
| Удалить категорию товаров. | `DELETE /brands/:brandId/product-categories/:categoryId` | Бренд | Да | Нет | Нет |
| Создать товар бренда. | `POST /brands/:brandId/products` | Бренд | Да | Нет | Нет |
| Найти товары бренда. | `GET /brands/:brandId/products` | Бренд | Да | Да | Да |
| Количество товаров по статусам. | `GET /brands/:brandId/products/status-counts` | Бренд | Да | Да | Да |
| Получить товар, включая упаковки. | `GET /brands/:brandId/products/:productId` | Бренд | Да | Да | Да |
| Изменить товар. | `PUT /brands/:brandId/products/:productId` | Бренд | Да | Нет | Нет |
| Изменить статус товара. | `PATCH /brands/:brandId/products/:productId/status` | Бренд | Да | Нет | Нет |
| Удалить неиспользуемый товар. | `DELETE /brands/:brandId/products/:productId` | Бренд | Да | Нет | Нет |
| Создать или заменить настройки товара в локации, включая цену и учёт остатков. | `PUT /locations/:locationId/products/:productId` | Локация | Да | Нет | Нет |
| Найти товары, подключённые к локации. | `GET /locations/:locationId/products` | Локация | Да | Да | Да |

### Упаковки товаров

Источники: [product-packaging.controller.ts](../../src/modules/products/product-packaging.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать неизменяемую упаковку товара; чтение доступно через карточку товара. | `POST /brands/:brandId/products/:productId/packagings` | Бренд | Да | Нет | Нет |
| Архивировать или восстановить упаковку товара. | `PATCH /brands/:brandId/products/:productId/packagings/:packagingId/status` | Бренд | Да | Нет | Нет |

### Поставщики

Источники: [suppliers.controller.ts](../../src/modules/suppliers/suppliers.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать поставщика бренда. | `POST /brands/:brandId/suppliers` | Поставщики | Да | Да | Нет |
| Найти поставщиков. | `GET /brands/:brandId/suppliers` | Поставщики | Да | Да | Да |
| Получить активных поставщиков для выбора. | `GET /brands/:brandId/suppliers/options` | Поставщики | Да | Да | Да |
| Получить карточку поставщика. | `GET /brands/:brandId/suppliers/:supplierId` | Поставщики | Да | Да | Да |
| Изменить поставщика. | `PUT /brands/:brandId/suppliers/:supplierId` | Поставщики | Да | Да | Нет |
| Деактивировать поставщика; DELETE не удаляет запись физически. | `DELETE /brands/:brandId/suppliers/:supplierId` | Поставщики | Да | Да | Нет |

### Склад

Источники: [inventory.controller.ts](../../src/modules/inventory/inventory.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Найти текущие остатки. | `GET /locations/:locationId/inventory` | Локация | Да | Да | Да |
| Получить счётчики таблицы остатков. | `GET /locations/:locationId/inventory/counts` | Локация | Да | Да | Да |
| Экспортировать текущие остатки в XLSX. | `GET /locations/:locationId/inventory/export` | Локация | Да | Да | Да |
| Найти строки оборотной ведомости. | `GET /locations/:locationId/inventory/vedomost` | Локация | Да | Да | Да |
| Экспортировать инвентаризационную ведомость для ручного пересчёта в XLSX. | `GET /locations/:locationId/inventory/export/inventory-statement` | Локация | Да | Да | Да |
| Экспортировать оборотную ведомость в XLSX. | `GET /locations/:locationId/inventory/export/vedomost` | Локация | Да | Да | Да |
| Получить движения выбранного товара. | `GET /locations/:locationId/inventory/:productId/movements` | Локация | Да | Да | Да |
| Экспортировать движения выбранного товара в XLSX. | `GET /locations/:locationId/inventory/:productId/movements/export` | Локация | Да | Да | Да |
| Создать открытый складской документ. | `POST /locations/:locationId/inventory/documents` | Локация | Да | Нет | Нет |
| Найти складские документы. | `GET /locations/:locationId/inventory/documents` | Локация | Да | Да | Да |
| Количество складских документов по статусам. | `GET /locations/:locationId/inventory/documents/status-counts` | Локация | Да | Да | Да |
| Получить складской документ с позициями. | `GET /locations/:locationId/inventory/documents/:documentId` | Локация | Да | Да | Да |
| Изменить открытый складской документ. | `PUT /locations/:locationId/inventory/documents/:documentId` | Локация | Да | Нет | Нет |
| Провести или аннулировать документ согласно допустимым переходам. | `PATCH /locations/:locationId/inventory/documents/:documentId/status` | Локация | Да | Нет | Нет |

### Условия оплаты труда

Источники: [staff-compensation.controller.ts](../../src/modules/payroll/compensation/staff-compensation.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Получить текущие условия оплаты выбранного сотрудника; ограничения только своим профилем нет. | `GET /locations/:locationId/staff/:id/compensation/current` | Локация | Да | Да | Да |
| Получить историю условий оплаты выбранного сотрудника. | `GET /locations/:locationId/staff/:id/compensation` | Локация | Да | Да | Да |
| Создать новую версию условий оплаты и закрыть предыдущую с effectiveFrom. | `PUT /locations/:locationId/staff/:id/compensation` | Локация | Да | Нет | Нет |

### Начисления

Источники: [staff-earnings.controller.ts](../../src/modules/payroll/earnings/staff-earnings.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Найти начисления сотрудников локации; ограничения только своими начислениями нет. | `GET /locations/:locationId/payroll/earnings` | Локация | Да | Да | Да |
| Получить начисления выбранного сотрудника. | `GET /locations/:locationId/staff/:id/earnings` | Локация | Да | Да | Да |
| Добавить ручную премию, удержание или корректировку. | `POST /locations/:locationId/staff/:id/earnings` | Локация | Да | Нет | Нет |
| Зарегистрировать комиссию за продажу товара без складской операции. | `POST /locations/:locationId/payroll/product-sales` | Локация | Да | Нет | Нет |

### Зарплатные периоды и отчёты

Источники: [payroll.controller.ts](../../src/modules/payroll/periods/payroll.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Создать зарплатный период. | `POST /locations/:locationId/payroll/periods` | Локация | Да | Нет | Нет |
| Получить диапазоны утверждённых и выплаченных периодов, закрытые для новых начислений. | `GET /locations/:locationId/payroll/locked-ranges` | Локация | Да | Да | Да |
| Найти зарплатные периоды. | `GET /locations/:locationId/payroll/periods` | Локация | Да | Да | Да |
| Количество периодов по статусам. | `GET /locations/:locationId/payroll/periods/status-counts` | Локация | Да | Да | Да |
| Получить период с результатами расчёта. | `GET /locations/:locationId/payroll/periods/:id` | Локация | Да | Да | Да |
| Получить ведомость и расчётные листки периода. | `GET /locations/:locationId/payroll/periods/:id/report` | Локация | Да | Да | Да |
| Получить начисления, включённые в период. | `GET /locations/:locationId/payroll/periods/:id/earnings` | Локация | Да | Да | Да |
| Экспортировать платёжную ведомость в XLSX. | `GET /locations/:locationId/payroll/periods/:id/export/vedomost` | Локация | Да | Да | Да |
| Экспортировать расчётные листки в XLSX. | `GET /locations/:locationId/payroll/periods/:id/export/payslips` | Локация | Да | Да | Да |
| Рассчитать или пересчитать период. | `POST /locations/:locationId/payroll/periods/:id/calculate` | Локация | Да | Нет | Нет |
| Утвердить рассчитанный период. | `POST /locations/:locationId/payroll/periods/:id/approve` | Локация | Да | Нет | Нет |
| Отметить утверждённый период как выплаченный. | `POST /locations/:locationId/payroll/periods/:id/pay` | Локация | Да | Нет | Нет |
| Удалить черновой или рассчитанный период. | `DELETE /locations/:locationId/payroll/periods/:id` | Локация | Да | Нет | Нет |
| Добавить корректировку после утверждения; она попадёт в следующий открытый период. | `POST /locations/:locationId/payroll/results/:id/corrections` | Локация | Да | Нет | Нет |

### Страницы онлайн-записи

Источники: [booking-pages.controller.ts](../../src/modules/booking-channels/controllers/booking-pages.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Проверить доступность slug. | `GET /locations/:locationId/booking-pages/slug-availability` | Локация | Да | Да | Да |
| Список страниц записи локации. | `GET /locations/:locationId/booking-pages` | Локация | Да | Да | Да |
| Создать страницу в статусе черновика. | `POST /locations/:locationId/booking-pages` | Локация | Да | Нет | Нет |
| Получить страницу записи. | `GET /locations/:locationId/booking-pages/:pageId` | Локация | Да | Да | Да |
| Заменить содержимое страницы без изменения статуса. | `PUT /locations/:locationId/booking-pages/:pageId` | Локация | Да | Нет | Нет |
| Опубликовать страницу или снять с публикации. | `PATCH /locations/:locationId/booking-pages/:pageId/status` | Локация | Да | Нет | Нет |
| Удалить страницу записи. | `DELETE /locations/:locationId/booking-pages/:pageId` | Локация | Да | Нет | Нет |

### Виджеты онлайн-записи

Источники: [booking-widgets.controller.ts](../../src/modules/booking-channels/controllers/booking-widgets.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Список виджетов локации. | `GET /locations/:locationId/booking-widgets` | Локация | Да | Да | Да |
| Создать виджет в статусе черновика. | `POST /locations/:locationId/booking-widgets` | Локация | Да | Нет | Нет |
| Получить виджет. | `GET /locations/:locationId/booking-widgets/:widgetId` | Локация | Да | Да | Да |
| Заменить содержимое виджета без изменения статуса. | `PUT /locations/:locationId/booking-widgets/:widgetId` | Локация | Да | Нет | Нет |
| Опубликовать виджет или снять с публикации. | `PATCH /locations/:locationId/booking-widgets/:widgetId/status` | Локация | Да | Нет | Нет |
| Удалить виджет. | `DELETE /locations/:locationId/booking-widgets/:widgetId` | Локация | Да | Нет | Нет |

### Аналитика и показатели

Источники: [bookings-analytics.controller.ts](../../src/modules/bookings/analytics/bookings-analytics.controller.ts), [clients-analytics.controller.ts](../../src/modules/clients/analytics/clients-analytics.controller.ts), [dashboard.controller.ts](../../src/modules/dashboard/dashboard.controller.ts), [inventory-analytics.controller.ts](../../src/modules/inventory/analytics/inventory-analytics.controller.ts), [products-analytics.controller.ts](../../src/modules/products/analytics/products-analytics.controller.ts), [services-analytics.controller.ts](../../src/modules/services/analytics/services-analytics.controller.ts), [staff-kpi.controller.ts](../../src/modules/staff/kpi/staff-kpi.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Получить аналитические виджеты бронирований. | `POST /locations/:locationId/bookings/analytics` | Локация | Да | Да | Да |
| Получить аналитику клиентской базы бренда. | `POST /brands/:brandId/clients/analytics` | Бренд | Да | Нет | Нет |
| Получить выбранные виджеты общей панели управления. | `POST /locations/:locationId/dashboard/widgets` | Локация | Да | Нет | Нет |
| Получить KPI склада. | `GET /locations/:locationId/inventory/kpi` | Локация | Да | Да | Да |
| Получить аналитические виджеты товаров. | `POST /locations/:locationId/products/analytics` | Локация | Да | Нет | Нет |
| Получить аналитические виджеты услуг. | `POST /locations/:locationId/services/analytics` | Локация | Да | Нет | Нет |
| Получить KPI сотрудников с учётом фильтров. | `GET /locations/:locationId/staff/widgets` | Локация | Да | Да | Да |

### Аудит

Источники: [audit.controller.ts](../../src/modules/audit/audit.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| История указанной сущности бренда. | `GET /brands/:brandId/audit` | Бренд | Да | Да | Да |
| История указанной сущности локации. | `GET /locations/:locationId/audit` | Локация | Да | Да | Да |

### Файлы

Источники: [files.controller.ts](../../src/modules/files/files.controller.ts).

| Действие / описание | Метод и путь | Область | OWNER | MANAGER | STAFF |
| --- | --- | --- | :---: | :---: | :---: |
| Загрузить файл бренда в хранилище. | `POST /brands/:brandId/files` | Бренд | Да | Да | Да |
| Удалить файл указанного бренда; не требуется быть его загрузившим пользователем. | `DELETE /brands/:brandId/files/:fileId` | Бренд | Да | Да | Да |

## Общие и публичные действия

Для каждого маршрута ниже доступ одинаково определяется указанным условием для USER, ADMIN, OWNER, MANAGER и STAFF: бизнес-роль сама по себе ничего не добавляет и не заменяет специальный токен. Для маршрутов без access token доступ возможен и без аккаунта.

### Авторизация

Источники: [auth.controller.ts](../../src/modules/auth/auth.controller.ts).

| Действие / описание | Метод и путь | Условие доступа |
| --- | --- | --- |
| Регистрация аккаунта. | `POST /auth/register` | Без access token; данные регистрации. |
| Вход по учётным данным и выдача токенов. | `POST /auth/login` | Без access token; корректные учётные данные. |
| Завершение сессии и очистка refresh cookie. | `POST /auth/logout` | Действующий refresh token в cookie. |
| Обновление токенов сессии. | `POST /auth/refresh` | Действующий refresh token в cookie. |
| Подтверждение email. | `POST /auth/confirm-email` | Email JWT в query-параметре token; обычный access token его не заменяет. |
| Запрос письма для сброса пароля. | `POST /auth/reset-password-request` | Без access token; данные запроса сброса. |
| Сброс пароля по коду из письма. | `POST /auth/reset-password` | Без access token; действующий код сброса и данные нового пароля. |
| Вход через Google OAuth. | `POST /auth/google` | Данные Google OAuth, проверяемые GoogleOAuthGuard. |
| Вход через VK OAuth. | `POST /auth/vk` | Данные VK OAuth, проверяемые VkOAuthGuard. |
| Вход через Yandex OAuth. | `POST /auth/yandex` | Данные Yandex OAuth, проверяемые YandexOAuthGuard. |

### Аккаунт и общие операции

Источники: [brand.controller.ts](../../src/modules/brand/brand.controller.ts), [files.controller.ts](../../src/modules/files/files.controller.ts), [location.controller.ts](../../src/modules/location/location.controller.ts), [staff.controller.ts](../../src/modules/staff/staff.controller.ts), [user.controller.ts](../../src/modules/user/user.controller.ts).

| Действие / описание | Метод и путь | Условие доступа |
| --- | --- | --- |
| Создать бренд с первой локацией; создатель получает OWNER. | `POST /brands` | Access token любого аккаунта USER или ADMIN; существующее членство не нужно. |
| Список активных брендов: USER видит бренды со своим BrandMembership, ADMIN — все подходящие. | `GET /brands` | Access token; фильтрация по членству бренда для USER. |
| Загрузить личный файл текущего пользователя. | `POST /users/me/files` | Access token USER или ADMIN; только собственный аккаунт/личные файлы. |
| Удалить личный файл текущего пользователя; проверяются пользователь и область хранения. | `DELETE /users/me/files/:fileId` | Access token USER или ADMIN; только собственный аккаунт/личные файлы. |
| Получить справочник стран, валют и часовых поясов для настройки локации. | `GET /locations/options` | Access token USER или ADMIN; членство не требуется. |
| Получить справочник типов бизнеса. | `GET /locations/business-types` | Access token USER или ADMIN; членство не требуется. |
| Принять действующее приглашение; создаётся LocationMembership с ролью STAFF. | `POST /staff/invitations/accept` | Access token и действующий токен приглашения; существующее членство локации вызывает конфликт. |
| Получить свой профиль и членства. | `GET /users/me` | Access token USER или ADMIN; только собственный аккаунт/личные файлы. |
| Изменить свой профиль; назначение бизнес-ролей этим API не предусмотрено. | `PUT /users/me` | Access token USER или ADMIN; только собственный аккаунт/личные файлы. |

### Клиентский токен бронирования

Источники: [bookings.controller.ts](../../src/modules/bookings/bookings.controller.ts).

| Действие / описание | Метод и путь | Условие доступа |
| --- | --- | --- |
| Получить бронирование, указанное в клиентском токене. | `GET /public/bookings/me` | Bearer booking-client-token; доступ только к бронированию из токена. |
| Отменить бронирование из клиентского токена при допустимом состоянии. | `POST /public/bookings/me/cancel` | Bearer booking-client-token; обычный access token, в том числе ADMIN, его не заменяет. |

### Публичные данные и онлайн-запись

Источники: [public-booking-channels.controller.ts](../../src/modules/booking-channels/controllers/public-booking-channels.controller.ts), [public-booking-create.controller.ts](../../src/modules/booking-channels/controllers/public-booking-create.controller.ts), [bookings.controller.ts](../../src/modules/bookings/bookings.controller.ts), [brand.controller.ts](../../src/modules/brand/brand.controller.ts), [calendar.controller.ts](../../src/modules/calendar/api/calendar.controller.ts), [health.controller.ts](../../src/modules/health/health.controller.ts), [location.controller.ts](../../src/modules/location/location.controller.ts).

| Действие / описание | Метод и путь | Условие доступа |
| --- | --- | --- |
| Получить опубликованную страницу записи по slug. | `GET /public/booking-pages/:slug` | Без access token; опубликованная страница активной локации/бренда. |
| Получить опубликованный виджет для встраивания; проверяется allowedDomains. | `GET /public/booking-widgets/:widgetId` | Без access token; опубликованный виджет активной локации/бренда и допустимый origin. |
| Создать публичное бронирование; проверяются онлайн-доступность, бан клиента, слот и указанный канал записи. | `POST /public/locations/:locationId/bookings` | Без access token; применяются условия публичной записи и канала. |
| Получить услуги и сотрудников для экрана записи. | `GET /public/locations/:locationId/booking-setup` | Без access token; бизнес-роль не проверяется. |
| Рассчитать доступные услуги и сотрудников для частично заполненной записи. | `POST /public/locations/:locationId/booking-resolve` | Без access token; бизнес-роль не проверяется. |
| Рассчитать предварительную стоимость записи. | `POST /public/locations/:locationId/pricing` | Без access token; бизнес-роль не проверяется. |
| Получить публичные сведения о бренде. | `GET /brands/:brandId/public` | Без access token; бизнес-роль не проверяется. |
| Получить свободные слоты с ограничениями публичной записи. | `GET /locations/:locationId/calendar/public/available-slots` | Без access token; применяются ограничения публичной записи. |
| Проверить, что приложение отвечает (liveness). | `GET /health` | Без access token; бизнес-роль не проверяется. |
| Получить публичные сведения о локации. | `GET /locations/:locationId/public` | Без access token; бизнес-роль не проверяется. |

## Обновление документа

При добавлении маршрута или изменении прав обновлять строку матрицы и связанные примечания. Проверять не только `@BrandRBAC`/`@LocationRBAC`/`@SupplierRBAC`, но и `assertBrandRole`, `assertLocationRole`, проверки `AuditActorRole` в сервисах и специальные guards. Описания Swagger могут отставать от фактических проверок.

Перечень сверяется по паре HTTP-метод + полный путь контроллера. На дату документа: 184 маршрута, из них 153 с бизнес-проверками и 31 общих/публичных. Swagger UI и его служебные ресурсы не входят в число маршрутов контроллеров. Проверка выполнена по исходному коду; запросы к работающему серверу не выполнялись.
