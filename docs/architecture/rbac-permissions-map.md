# Permissions для API

В обозначениях ниже `claim:read` / `claim:write` двоеточие отделяет действие от ключа. В API это отдельные поля `claim` и `access`; в JWT — карта `claim → read | write | readWrite`. Точки группируют имена, но не выдают дочерние права.

Сопоставление маршрутов с проверками backend на 2026-10-19. [Модель ролей и defaults](./rbac.md), [контракты управления доступом](./rbac-contracts.md). Permissions `*.export` закрывают только скачивание XLSX. Параметр списка `isExport=true` отключает пагинацию и доступен при том же праве чтения, что и обычный список.

Составные действия проверяют все перечисленные permissions и состояние документа. Аналитические endpoints ниже не проверяют permissions по содержимому выбранных показателей; дополнительное `inventory:read` явно требуется только у складского KPI.

Маршруты управления доступом описаны отдельно в контрактах. Эта карта дополняет OpenAPI условиями авторизации и не заменяет DTO из кода.

## Как читать

- B — управление брендом, G — общие данные бренда, L — филиал, U — собственный аккаунт/доступная навигация, P — публичный или специальный сценарий.
- `+` означает все перечисленные permissions. Дополнительно действуют зависимости чтения из контракта вычисления доступа.
- Название метода рядом с HTTP-путём связывает действие с исходником. Описание действия и defaults ролей находятся в модели ролей.
- Принадлежность всех ID проверяется владельцем домена независимо от permission.
- P не означает отсутствие проверок: сохраняются условия JWT, refresh/email/client token, публичной публикации и валидации.
- U не является доступом к произвольному чужому аккаунту. Псевдоключи после U/P обозначают сценарии, не новые permissions.

## audit

[Исходник](../../src/modules/audit/controllers/audit.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /brands/:brandId/audit` | `getBrandHistory` | B: `audit.brand:read` | — |
| `GET /locations/:locationId/audit` | `getLocationHistory` | L: `audit.location:read` | — |

## auth

[Исходник](../../src/modules/auth/controllers/auth.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /auth/register` | `register` | P: `existing-auth` | — |
| `POST /auth/login` | `login` | P: `existing-auth` | — |
| `POST /auth/logout` | `logout` | P: `existing-auth` | — |
| `POST /auth/refresh` | `refresh` | P: `existing-auth` | — |
| `POST /auth/confirm-email` | `confirmEmail` | P: `existing-auth` | — |
| `POST /auth/reset-password-request` | `resetPasswordRequest` | P: `existing-auth` | — |
| `POST /auth/reset-password` | `resetPassword` | P: `existing-auth` | — |
| `POST /auth/google` | `googleOAuth` | P: `existing-auth` | — |
| `POST /auth/vk` | `vkOAuth` | P: `existing-auth` | — |
| `POST /auth/yandex` | `yandexOAuth` | P: `existing-auth` | — |

## booking-pages

[Исходник](../../src/modules/booking-channels/controllers/booking-pages.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/booking-pages/slug-availability` | `checkSlug` | L: `booking-channel:read` | — |
| `GET /locations/:locationId/booking-pages` | `list` | L: `booking-channel:read` | — |
| `POST /locations/:locationId/booking-pages` | `create` | L: `booking-channel:write` | — |
| `GET /locations/:locationId/booking-pages/:pageId` | `findById` | L: `booking-channel:read` | — |
| `PUT /locations/:locationId/booking-pages/:pageId` | `update` | L: `booking-channel:write` | — |
| `PATCH /locations/:locationId/booking-pages/:pageId/status` | `updateStatus` | L: `booking-channel:write` | — |
| `DELETE /locations/:locationId/booking-pages/:pageId` | `delete` | L: `booking-channel:write` | — |

## booking-widgets

[Исходник](../../src/modules/booking-channels/controllers/booking-widgets.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/booking-widgets` | `list` | L: `booking-channel:read` | — |
| `POST /locations/:locationId/booking-widgets` | `create` | L: `booking-channel:write` | — |
| `GET /locations/:locationId/booking-widgets/:widgetId` | `findById` | L: `booking-channel:read` | — |
| `PUT /locations/:locationId/booking-widgets/:widgetId` | `update` | L: `booking-channel:write` | — |
| `PATCH /locations/:locationId/booking-widgets/:widgetId/status` | `updateStatus` | L: `booking-channel:write` | — |
| `DELETE /locations/:locationId/booking-widgets/:widgetId` | `delete` | L: `booking-channel:write` | — |

## public-booking-channels

[Исходник](../../src/modules/booking-channels/controllers/public-booking-channels.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /public/booking-pages/:slug` | `getPage` | P: `public` | — |
| `GET /public/booking-widgets/:widgetId` | `getWidget` | P: `public` | — |

## public-booking-create

[Исходник](../../src/modules/booking-channels/controllers/public-booking-create.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /public/locations/:locationId/bookings` | `createPublic` | P: `public` | — |

## bookings-analytics

[Исходник](../../src/modules/bookings/analytics/controllers/bookings-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/bookings/analytics` | `analytics` | L: `analytics.location:read` или `booking.own:read` | При own-чтении сервер принудительно выбирает собственного исполнителя; общий booking:read это ограничение не снимает. |

## bookings

[Исходник](../../src/modules/bookings/controllers/bookings.controller.ts)

[Клиентские операции](../../src/modules/bookings/controllers/booking-client.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /public/locations/:locationId/booking-setup` | `getBookingSetup` | P: `public` | — |
| `POST /public/locations/:locationId/booking-resolve` | `resolveBooking` | P: `public` | — |
| `POST /public/locations/:locationId/pricing` | `priceBooking` | P: `public` | — |
| `GET /public/bookings/me` | `getByClientToken` | P: `booking-client-token` | Токен только этой записи; бизнес-роль не требуется. |
| `GET /public/bookings/me/available-slots` | `getClientAvailableSlots` | P: `booking-client-token` | Слоты только для записи из токена, с сохранением услуг и сотрудников. |
| `POST /public/bookings/me/reschedule` | `rescheduleByClientToken` | P: `booking-client-token` | Только предстоящая PENDING/CONFIRMED; повторная проверка слотов в транзакции. |
| `POST /public/bookings/me/cancel` | `cancelByClientToken` | P: `booking-client-token` | Действующая клиентская политика отмены; не обход к возврату произвольного заказа. |
| `POST /locations/:locationId/bookings/manual` | `createManual` | L: `booking:write` | Произвольная цена: также sale.price.override:write. Товары: order:write. Клиент находится или создаётся автоматически независимо от client:write. WALK_IN с немедленным COMPLETED: order:write. |
| `GET /locations/:locationId/bookings/status-counts` | `getStatusCounts` | L: `booking:read` или `booking.own:read` | При own-чтении обязательно участие в записи; списки и счётчики ограничены до пагинации. |
| `GET /locations/:locationId/bookings/export` | `export` | L: `booking.export:read` | — |
| `GET /locations/:locationId/bookings/:id` | `findById` | L: `booking:read` или `booking.own:read` | При own-чтении обязательно участие в записи; списки и счётчики ограничены до пагинации. |
| `GET /locations/:locationId/bookings` | `search` | L: `booking:read` или `booking.own:read` | При own-чтении обязательно участие в записи; списки и счётчики ограничены до пагинации. |
| `PUT /locations/:locationId/bookings/:id` | `update` | L: `booking:write` или `booking.own:write` | При own-праве достаточно участия в одной услуге; действие над всей записью. Изменение цены требует sale.price.override:write; завершённую запись STAFF не редактирует. |
| `PATCH /locations/:locationId/bookings/:id/status` | `updateStatus` | L: `booking:write` или `booking.own:write` | При own-праве достаточно участия в одной услуге. Завершение проводит услуги/начисления без order:write; отмена или откат завершённого требуют order.return:write. |
| `POST /locations/:locationId/bookings/:id/products` | `addProduct` | L: `booking:read` + `order:write` | Произвольная цена: также sale.price.override:write. Клиента не создаёт. |
| `POST /locations/:locationId/bookings/:id/items` | `addItems` | L: `booking:read` + `order:write` | Произвольная цена: также sale.price.override:write. Клиента не создаёт. |
| `POST /locations/:locationId/bookings/:id/client-token` | `generateClientToken` | L: `booking.clientToken:write` | — |
| `POST /locations/:locationId/bookings/:id/cancel` | `cancel` | L: `booking:write` или `booking.own:write` | При own-праве достаточно участия в одной услуге. Завершение проводит услуги/начисления без order:write; отмена или откат завершённого требуют order.return:write. |
| `DELETE /locations/:locationId/bookings/:id` | `delete` | L: `booking.delete:write` | При сторнировании проведённого — также order.return:write. |

## brand

[Исходник](../../src/modules/brand/controllers/brand.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands` | `create` | U: `create-brand` | Создатель получает OWNER бренда атомарно. |
| `GET /brands` | `search` | U: `accessible-brands` | Только доступные бренды; локальное членство также учитывается. |
| `GET /brands/:brandId` | `findById` | B: `brand:read` | — |
| `PUT /brands/:brandId` | `update` | B: `brand.settings:write` | — |
| `GET /brands/:brandId/public` | `findPublic` | P: `public` | — |
| `DELETE /brands/:brandId` | `delete` | B: `brand.settings:write` | — |

## calendar

[Исходник](../../src/modules/calendar/api/controllers/calendar.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/calendar/public/available-slots` | `getAvailableSlots` | P: `public` | — |
| `GET /locations/:locationId/calendar/available-slots` | `getManualAvailableSlots` | L: `booking:read` или `booking.own:read` | При own-чтении свой календарь и общие блокировки; чужой блок по ID закрыт. Исключение событий при переносе требует участия в редактируемой записи. |
| `GET /locations/:locationId/calendar` | `getCalendar` | L: `booking:read` или `booking.own:read` | При own-чтении свой календарь и общие блокировки; чужой блок по ID закрыт. Исключение событий при переносе требует участия в редактируемой записи. |
| `GET /locations/:locationId/calendar/:eventId` | `getEvent` | L: `booking:read` или `booking.own:read` | При own-чтении свой календарь и общие блокировки; чужой блок по ID закрыт. Исключение событий при переносе требует участия в редактируемой записи. |
| `POST /locations/:locationId/calendar` | `create` | L: `calendar.blocks:write` | — |
| `PUT /locations/:locationId/calendar/:eventId/occurrence` | `moveOccurrence` | L: `calendar.blocks:write` | — |
| `PUT /locations/:locationId/calendar/:eventId` | `update` | L: `calendar.blocks:write` | — |
| `DELETE /locations/:locationId/calendar/:eventId` | `delete` | L: `calendar.blocks:write` | — |

## clients-analytics

[Исходник](../../src/modules/clients/analytics/controllers/clients-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/clients/analytics` | `analytics` | B: `analytics.brand:read` | — |

## clients

[Исходник](../../src/modules/clients/controllers/clients.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/clients` | `create` | G: `client:write` | — |
| `POST /brands/:brandId/clients/import` | `import` | G: `client.import:write` | — |
| `PUT /brands/:brandId/clients/:id` | `update` | G: `client:write` | — |
| `PATCH /brands/:brandId/clients/:id/ban` | `setBan` | G: `client.ban:write` | — |
| `GET /brands/:brandId/clients/export` | `export` | G: `client.export:read` | — |
| `GET /brands/:brandId/clients/:id` | `findById` | G: `client:read` | — |
| `GET /brands/:brandId/clients` | `search` | G: `client:read` | — |

## dashboard

[Исходник](../../src/modules/dashboard/controllers/dashboard.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/dashboard/widgets` | `getWidgets` | L: `analytics.location:read` | Дополнительных проверок payroll:read/inventory:read по показателям нет. |

## files

[Исходник](../../src/modules/files/controllers/files.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/files` | `uploadForBrand` | G: `file.brand:write` | — |
| `POST /users/me/files` | `uploadForUser` | U: `own-files` | Только собственные файлы. |
| `DELETE /brands/:brandId/files/:fileId` | `deleteFromBrand` | G: `file.brand:write` | Удаление связанного файла не должно обходить запрет изменения сущности. |
| `DELETE /users/me/files/:fileId` | `deleteFromUser` | U: `own-files` | Только собственные файлы. |

## health

[Исходник](../../src/modules/health/controllers/health.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /health` | `check` | P: `health` | — |

## inventory-analytics

[Исходник](../../src/modules/inventory/analytics/controllers/inventory-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/inventory/kpi` | `getKpi` | L: `analytics.location:read` + `inventory:read` | — |

## inventory

[Исходник](../../src/modules/inventory/controllers/inventory.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/inventory` | `search` | L: `inventory:read` | — |
| `GET /locations/:locationId/inventory/counts` | `getCounts` | L: `inventory:read` | — |
| `GET /locations/:locationId/inventory/export` | `exportBalances` | L: `inventory.export:read` | — |
| `GET /locations/:locationId/inventory/vedomost` | `searchVedomost` | L: `inventory:read` | — |
| `GET /locations/:locationId/inventory/export/inventory-statement` | `exportInventoryStatement` | L: `inventory.export:read` | — |
| `GET /locations/:locationId/inventory/export/vedomost` | `exportVedomost` | L: `inventory.export:read` | — |
| `GET /locations/:locationId/inventory/:productId/movements` | `searchMovements` | L: `inventory:read` | — |
| `GET /locations/:locationId/inventory/:productId/movements/export` | `exportMovements` | L: `inventory.export:read` | — |
| `POST /locations/:locationId/inventory/documents` | `createDocument` | L: `inventory:write` | Если задан destinationLocationId, также inventory:write получателя. |
| `GET /locations/:locationId/inventory/documents` | `searchDocuments` | L: `inventory:read` | — |
| `GET /locations/:locationId/inventory/documents/status-counts` | `getDocumentStatusCounts` | L: `inventory:read` | — |
| `GET /locations/:locationId/inventory/documents/:documentId` | `findDocument` | L: `inventory:read` | — |
| `PUT /locations/:locationId/inventory/documents/:documentId` | `updateDocument` | L: `inventory:write` | Также inventory:write прежнего и нового получателя, если они заданы. |
| `PATCH /locations/:locationId/inventory/documents/:documentId/status` | `changeDocumentStatus` | L: `inventory:write` | Также inventory:write сохранённого получателя, если задан. |

## location

[Исходник](../../src/modules/location/controllers/location.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/options` | `options` | U: `reference` | — |
| `GET /locations/business-types` | `businessTypes` | U: `reference` | — |
| `POST /brands/:brandId/locations` | `create` | B: `location.create:write` | — |
| `GET /brands/:brandId/locations` | `listByBrand` | U: `accessible-locations` | Только филиалы, доступные пользователю; чужие исключаются до подсчёта и выдачи. |
| `GET /locations/:locationId` | `findById` | L: `location:read` | — |
| `PUT /locations/:locationId` | `update` | L: `location.settings:write` | — |
| `GET /locations/:locationId/public` | `findPublic` | P: `public` | — |
| `DELETE /locations/:locationId` | `delete` | L: `location.settings:write` | — |

## orders

[Исходник](../../src/modules/orders/controllers/orders.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/orders` | `create` | L: `order:write` | Произвольная цена: также sale.price.override:write. confirmImmediately: также order:write. Принимает существующий clientId; новый клиент создаётся отдельным API с G:client:write. |
| `GET /locations/:locationId/orders` | `search` | L: `order:read` | — |
| `GET /locations/:locationId/orders/status-counts` | `getStatusCounts` | L: `order:read` | — |
| `GET /locations/:locationId/orders/:orderId` | `findById` | L: `order:read` | — |
| `PUT /locations/:locationId/orders/:orderId` | `update` | L: `order:write` | Изменение/сброс произвольной цены: также sale.price.override:write. Клиента не создаёт. |
| `PATCH /locations/:locationId/orders/:orderId/status` | `changeStatus` | L: `order.void:write` | Текущий DTO допускает только VOIDED. Новые статусы потребуют явной проверки действия. |
| `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/confirm` | `confirmItem` | L: `order:write` | — |
| `POST /locations/:locationId/orders/:orderId/items` | `addItems` | L: `order:write` | Произвольная цена: также sale.price.override:write. Клиента не создаёт. |
| `POST /locations/:locationId/orders/:orderId/items/confirm` | `confirmItems` | L: `order:write` | — |
| `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/reverse` | `reverseItem` | L: `order.return:write` | — |
| `POST /locations/:locationId/orders/:orderId/returns` | `createReturn` | L: `order.return:write` | — |
| `DELETE /locations/:locationId/orders/:orderId` | `delete` | L: `order:write` | — |

## staff-compensation

[Исходник](../../src/modules/payroll/compensation/controllers/staff-compensation.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/staff/:id/compensation/current` | `current` | L: `payroll:read` | — |
| `GET /locations/:locationId/staff/:id/compensation` | `history` | L: `payroll:read` | — |
| `PUT /locations/:locationId/staff/:id/compensation` | `replace` | L: `payroll:write` | — |

## staff-earnings

[Исходник](../../src/modules/payroll/earnings/controllers/staff-earnings.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/payroll/earnings` | `search` | L: `payroll:read` или `payroll.own:read` | Own: принудительно свои начисления в списке; адресный запрос другого сотрудника запрещён. |
| `GET /locations/:locationId/staff/:id/earnings` | `listForStaff` | L: `payroll:read` или `payroll.own:read` | Own: принудительно свои начисления в списке; адресный запрос другого сотрудника запрещён. |
| `POST /locations/:locationId/staff/:id/earnings` | `createManual` | L: `payroll:write` | — |
| `POST /locations/:locationId/payroll/product-sales` | `recordProductSale` | L: `payroll:write` | Создание комиссии без склада: payroll:write, а не право обычной продажи. |

## payroll

[Исходник](../../src/modules/payroll/periods/controllers/payroll-periods.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/payroll/periods` | `create` | L: `payroll:write` | — |
| `GET /locations/:locationId/payroll/locked-ranges` | `lockedRanges` | L: `payroll:read` | В текущем API это периоды блокировки ручных начислений; STAFF закрыто. |
| `GET /locations/:locationId/payroll/periods` | `search` | L: `payroll:read` | — |
| `GET /locations/:locationId/payroll/periods/status-counts` | `getStatusCounts` | L: `payroll:read` | — |
| `GET /locations/:locationId/payroll/periods/:id` | `findById` | L: `payroll:read` | — |
| `GET /locations/:locationId/payroll/periods/:id/report` | `report` | L: `payroll:read` | — |
| `GET /locations/:locationId/payroll/periods/:id/earnings` | `listPeriodEarnings` | L: `payroll:read` | — |
| `GET /locations/:locationId/payroll/periods/:id/export/vedomost` | `exportVedomost` | L: `payroll.export:read` | — |
| `GET /locations/:locationId/payroll/periods/:id/export/payslips` | `exportPayslips` | L: `payroll.export:read` | — |
| `POST /locations/:locationId/payroll/periods/:id/calculate` | `calculate` | L: `payroll:write` | — |
| `POST /locations/:locationId/payroll/periods/:id/approve` | `approve` | L: `payroll:write` | — |
| `POST /locations/:locationId/payroll/periods/:id/pay` | `pay` | L: `payroll:write` | — |
| `DELETE /locations/:locationId/payroll/periods/:id` | `delete` | L: `payroll:write` | — |
| `POST /locations/:locationId/payroll/results/:id/corrections` | `correct` | L: `payroll:write` | — |

## products-analytics

[Исходник](../../src/modules/products/analytics/controllers/products-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/products/analytics` | `analytics` | B: `analytics.brand:read` | Все активные локации бренда либо выбранные `locationIds`; принадлежность локаций бренду проверяется до расчёта. Включая валовую прибыль. |

## product-packaging

[Исходник](../../src/modules/products/controllers/product-packaging.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/products/:productId/packagings` | `create` | G: `product.catalog:write` | — |
| `PATCH /brands/:brandId/products/:productId/packagings/:packagingId/status` | `changeStatus` | G: `product.catalog:write` | — |

## products

[Исходник](../../src/modules/products/controllers/products.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/product-categories` | `createCategory` | G: `product.catalog:write` | — |
| `GET /brands/:brandId/product-categories` | `listCategories` | G: `product.catalog:read` | — |
| `PUT /brands/:brandId/product-categories/:categoryId` | `updateCategory` | G: `product.catalog:write` | — |
| `DELETE /brands/:brandId/product-categories/:categoryId` | `deleteCategory` | G: `product.catalog:write` | — |
| `POST /brands/:brandId/products` | `create` | G: `product.catalog:write` | — |
| `GET /brands/:brandId/products` | `search` | G: `product.catalog:read` | — |
| `GET /brands/:brandId/products/status-counts` | `getStatusCounts` | G: `product.catalog:read` | — |
| `GET /brands/:brandId/products/:productId` | `findById` | G: `product.catalog:read` | — |
| `PUT /brands/:brandId/products/:productId` | `update` | G: `product.catalog:write` | — |
| `PATCH /brands/:brandId/products/:productId/status` | `changeStatus` | G: `product.catalog:write` | — |
| `DELETE /brands/:brandId/products/:productId` | `delete` | G: `product.catalog:write` | — |
| `PUT /locations/:locationId/products/:productId` | `upsertLocation` | L: `product.location:write` | — |
| `GET /locations/:locationId/products` | `searchLocation` | L: `product.location:read` | — |

## services-analytics

[Исходник](../../src/modules/services/analytics/controllers/services-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/services/analytics` | `analytics` | L: `analytics.location:read` | Дополнительных проверок payroll:read/inventory:read по показателям нет. |

## services

[Чтение каталога](../../src/modules/services/catalog/controllers/service-catalog.controller.ts), [изменение услуг](../../src/modules/services/service-write/controllers/service-write.controller.ts), [изменение комплексов](../../src/modules/services/bundle-write/controllers/service-bundle-write.controller.ts), [категории](../../src/modules/services/categories/controllers/service-categories.controller.ts). После разделения контроллеров HTTP-пути сохранены, operationId изменились.

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/service-categories` | `createCategory` | L: `service:write` | — |
| `GET /locations/:locationId/service-categories` | `listCategories` | L: `service:read` | — |
| `PUT /locations/:locationId/service-categories/:categoryId` | `updateCategory` | L: `service:write` | — |
| `DELETE /locations/:locationId/service-categories/:categoryId` | `deleteCategory` | L: `service:write` | — |
| `POST /locations/:locationId/services` | `create` | L: `service:write` | — |
| `PUT /locations/:locationId/services/:id` | `update` | L: `service:write` | — |
| `GET /locations/:locationId/service-catalog/counts` | `getCatalogCounts` | L: `service:read` | — |
| `GET /locations/:locationId/service-catalog` | `searchCatalog` | L: `service:read` | — |
| `POST /locations/:locationId/service-bundles` | `createBundle` | L: `service:write` | — |
| `GET /locations/:locationId/service-bundles/:id` | `findBundleById` | L: `service:read` | — |
| `PUT /locations/:locationId/service-bundles/:id` | `updateBundle` | L: `service:write` | — |
| `PATCH /locations/:locationId/service-bundles/:id/status` | `updateBundleStatus` | L: `service:write` | — |
| `DELETE /locations/:locationId/service-bundles/:id` | `deleteBundle` | L: `service:write` | — |
| `GET /locations/:locationId/services/:id` | `findById` | L: `service:read` | — |
| `PATCH /locations/:locationId/services/:id/status` | `updateStatus` | L: `service:write` | — |
| `DELETE /locations/:locationId/services/:id` | `delete` | L: `service:write` | — |

## staff-analytics

[Исходник](../../src/modules/staff/analytics/controllers/staff-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/staff/widgets` | `getWidgets` | L: `analytics.location:read` | Дополнительных проверок payroll:read/inventory:read по показателям нет. |

## staff

[Исходник](../../src/modules/staff/controllers/staff.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/staff/directory` | `directory` | L: `booking:read` или `booking.own:read` | Только id/name/roleTitle/status коллег; кадровые и контактные данные не возвращаются. |
| `POST /locations/:locationId/staff` | `create` | L: `staff:write` | — |
| `PUT /locations/:locationId/staff/:id` | `update` | L: `staff:write` | — |
| `GET /locations/:locationId/staff/status-counts` | `getStatusCounts` | L: `staff:read` | — |
| `GET /locations/:locationId/staff/export` | `export` | L: `staff.export:read` | — |
| `GET /locations/:locationId/staff/:id` | `findById` | L: `staff:read` или `staff.own:read` | Own: только собственный активный профиль или его смены. |
| `GET /locations/:locationId/staff` | `search` | L: `staff:read` | — |
| `PATCH /locations/:locationId/staff/:id/status` | `changeStatus` | L: `staff:write` | — |
| `DELETE /locations/:locationId/staff/:id` | `delete` | L: `staff:write` | — |
| `GET /locations/:locationId/staff/:id/shifts` | `getShifts` | L: `staff:read` или `staff.own:read` | Own: только собственный активный профиль или его смены. |
| `PUT /locations/:locationId/staff/:id/shifts` | `replaceShifts` | L: `staff:write` | — |

## suppliers

[Исходник](../../src/modules/suppliers/controllers/suppliers.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/suppliers` | `create` | G: `supplier:write` | — |
| `GET /brands/:brandId/suppliers` | `search` | G: `supplier:read` | — |
| `GET /brands/:brandId/suppliers/options` | `listOptions` | G: `supplier:read` | — |
| `GET /brands/:brandId/suppliers/:supplierId` | `findById` | G: `supplier:read` | — |
| `PUT /brands/:brandId/suppliers/:supplierId` | `update` | G: `supplier:write` | — |
| `DELETE /brands/:brandId/suppliers/:supplierId` | `deactivate` | G: `supplier:write` | — |

## user

[Исходник](../../src/modules/user/controllers/user.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /users/me` | `me` | U: `own-account` | — |
| `PUT /users/me` | `updateMe` | U: `own-account` | — |
