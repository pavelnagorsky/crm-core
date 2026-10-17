# Целевые permissions для существующих API

Реализовано в backend, 2026-10-16. [Модель и defaults](./rbac-target.md), [исторические роли и API](./rbac.md), [контракты управления доступом](./rbac-contracts.md). Для списков клиентов, сотрудников, записей, склада и зарплаты режим `isExport=true` дополнительно требует соответствующий export-permission, как и отдельный XLSX endpoint.

Покрыты все 184 маршрута из 31 controller-файла на момент проектирования. Новые маршруты управления доступом описаны отдельно в контрактах.

## Как читать

- B — управление брендом, G — общие данные бренда, L — филиал, U — собственный аккаунт/доступная навигация, P — публичный или специальный сценарий.
- `+` означает все перечисленные permissions. Дополнительно действуют зависимости чтения из контракта вычисления доступа.
- Название метода рядом с HTTP-путём связывает действие с исходником. Описание действия и defaults ролей находятся в целевой матрице.
- Принадлежность всех ID проверяется владельцем домена независимо от permission.
- P не означает отсутствие проверок: сохраняются условия JWT, refresh/email/client token, публичной публикации и валидации.
- U не является доступом к произвольному чужому аккаунту. Псевдоключи после U/P обозначают сценарии, не новые permissions.

## audit

[Исходник](../../src/modules/audit/controllers/audit.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /brands/:brandId/audit` | `getBrandHistory` | B: `audit.brand.read` | — |
| `GET /locations/:locationId/audit` | `getLocationHistory` | L: `audit.location.read` | — |

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
| `GET /locations/:locationId/booking-pages/slug-availability` | `checkSlug` | L: `booking-channel.read` | — |
| `GET /locations/:locationId/booking-pages` | `list` | L: `booking-channel.read` | — |
| `POST /locations/:locationId/booking-pages` | `create` | L: `booking-channel.manage` | — |
| `GET /locations/:locationId/booking-pages/:pageId` | `findById` | L: `booking-channel.read` | — |
| `PUT /locations/:locationId/booking-pages/:pageId` | `update` | L: `booking-channel.manage` | — |
| `PATCH /locations/:locationId/booking-pages/:pageId/status` | `updateStatus` | L: `booking-channel.manage` | — |
| `DELETE /locations/:locationId/booking-pages/:pageId` | `delete` | L: `booking-channel.manage` | — |

## booking-widgets

[Исходник](../../src/modules/booking-channels/controllers/booking-widgets.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/booking-widgets` | `list` | L: `booking-channel.read` | — |
| `POST /locations/:locationId/booking-widgets` | `create` | L: `booking-channel.manage` | — |
| `GET /locations/:locationId/booking-widgets/:widgetId` | `findById` | L: `booking-channel.read` | — |
| `PUT /locations/:locationId/booking-widgets/:widgetId` | `update` | L: `booking-channel.manage` | — |
| `PATCH /locations/:locationId/booking-widgets/:widgetId/status` | `updateStatus` | L: `booking-channel.manage` | — |
| `DELETE /locations/:locationId/booking-widgets/:widgetId` | `delete` | L: `booking-channel.manage` | — |

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
| `POST /locations/:locationId/bookings/analytics` | `analytics` | L: `analytics.location.read` | Если результат включает зарплаты/складские данные — также payroll.read/inventory.read; весь запрос отклоняется при нехватке прав. |

## bookings

[Исходник](../../src/modules/bookings/controllers/bookings.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /public/locations/:locationId/booking-setup` | `getBookingSetup` | P: `public` | — |
| `POST /public/locations/:locationId/booking-resolve` | `resolveBooking` | P: `public` | — |
| `POST /public/locations/:locationId/pricing` | `priceBooking` | P: `public` | — |
| `GET /public/bookings/me` | `getByClientToken` | P: `booking-client-token` | Токен только этой записи; бизнес-роль не требуется. |
| `POST /public/bookings/me/cancel` | `cancelByClientToken` | P: `booking-client-token` | Действующая клиентская политика отмены; не обход к возврату произвольного заказа. |
| `POST /locations/:locationId/bookings/manual` | `createManual` | L: `booking.create` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `GET /locations/:locationId/bookings/status-counts` | `getStatusCounts` | L: `booking.read` | — |
| `GET /locations/:locationId/bookings/export` | `export` | L: `booking.export` | — |
| `GET /locations/:locationId/bookings/:id` | `findById` | L: `booking.read` | — |
| `GET /locations/:locationId/bookings` | `search` | L: `booking.read` | — |
| `PUT /locations/:locationId/bookings/:id` | `update` | L: `booking.update` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `PATCH /locations/:locationId/bookings/:id/status` | `updateStatus` | L: `booking.status.manage` | При проведении также order.confirm; при сторнировании проведённого — order.return. |
| `POST /locations/:locationId/bookings/:id/products` | `addProduct` | L: `booking.read` + `order.update` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `POST /locations/:locationId/bookings/:id/items` | `addItems` | L: `booking.read` + `order.update` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `POST /locations/:locationId/bookings/:id/client-token` | `generateClientToken` | L: `booking.client-token.issue` | — |
| `POST /locations/:locationId/bookings/:id/cancel` | `cancel` | L: `booking.cancel` | При сторнировании проведённого — также order.return. |
| `DELETE /locations/:locationId/bookings/:id` | `delete` | L: `booking.delete` | При сторнировании проведённого — также order.return. |

## brand

[Исходник](../../src/modules/brand/controllers/brand.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands` | `create` | U: `create-brand` | Создатель получает OWNER бренда атомарно. |
| `GET /brands` | `search` | U: `accessible-brands` | Только доступные бренды; локальное членство также учитывается. |
| `GET /brands/:brandId` | `findById` | B: `brand.read` | — |
| `PUT /brands/:brandId` | `update` | B: `brand.settings.manage` | — |
| `GET /brands/:brandId/public` | `findPublic` | P: `public` | — |
| `DELETE /brands/:brandId` | `delete` | B: `brand.settings.manage` | — |

## calendar

[Исходник](../../src/modules/calendar/api/controllers/calendar.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/calendar/public/available-slots` | `getAvailableSlots` | P: `public` | — |
| `GET /locations/:locationId/calendar/available-slots` | `getManualAvailableSlots` | L: `booking.read` | — |
| `GET /locations/:locationId/calendar` | `getCalendar` | L: `calendar.read` | — |
| `GET /locations/:locationId/calendar/:eventId` | `getEvent` | L: `calendar.read` | — |
| `POST /locations/:locationId/calendar` | `create` | L: `calendar.blocks.manage` | — |
| `PUT /locations/:locationId/calendar/:eventId/occurrence` | `moveOccurrence` | L: `calendar.blocks.manage` | — |
| `PUT /locations/:locationId/calendar/:eventId` | `update` | L: `calendar.blocks.manage` | — |
| `DELETE /locations/:locationId/calendar/:eventId` | `delete` | L: `calendar.blocks.manage` | — |

## clients-analytics

[Исходник](../../src/modules/clients/analytics/controllers/clients-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/clients/analytics` | `analytics` | B: `analytics.brand.read` | — |

## clients

[Исходник](../../src/modules/clients/controllers/clients.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/clients` | `create` | G: `client.create` | — |
| `POST /brands/:brandId/clients/import` | `import` | G: `client.import` | — |
| `PUT /brands/:brandId/clients/:id` | `update` | G: `client.update` | — |
| `PATCH /brands/:brandId/clients/:id/ban` | `setBan` | G: `client.ban` | — |
| `GET /brands/:brandId/clients/export` | `export` | G: `client.export` | — |
| `GET /brands/:brandId/clients/:id` | `findById` | G: `client.read` | — |
| `GET /brands/:brandId/clients` | `search` | G: `client.read` | — |

## dashboard

[Исходник](../../src/modules/dashboard/controllers/dashboard.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/dashboard/widgets` | `getWidgets` | L: `analytics.location.read` | Если результат включает зарплаты/складские данные — также payroll.read/inventory.read; весь запрос отклоняется при нехватке прав. |

## files

[Исходник](../../src/modules/files/controllers/files.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/files` | `uploadForBrand` | G: `file.brand.manage` | — |
| `POST /users/me/files` | `uploadForUser` | U: `own-files` | Только собственные файлы. |
| `DELETE /brands/:brandId/files/:fileId` | `deleteFromBrand` | G: `file.brand.manage` | Удаление связанного файла не должно обходить запрет изменения сущности. |
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
| `GET /locations/:locationId/inventory/kpi` | `getKpi` | L: `analytics.location.read` + `inventory.read` | — |

## inventory

[Исходник](../../src/modules/inventory/controllers/inventory.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/inventory` | `search` | L: `inventory.read` | — |
| `GET /locations/:locationId/inventory/counts` | `getCounts` | L: `inventory.read` | — |
| `GET /locations/:locationId/inventory/export` | `exportBalances` | L: `inventory.export` | — |
| `GET /locations/:locationId/inventory/vedomost` | `searchVedomost` | L: `inventory.read` | — |
| `GET /locations/:locationId/inventory/export/inventory-statement` | `exportInventoryStatement` | L: `inventory.export` | — |
| `GET /locations/:locationId/inventory/export/vedomost` | `exportVedomost` | L: `inventory.export` | — |
| `GET /locations/:locationId/inventory/:productId/movements` | `searchMovements` | L: `inventory.read` | — |
| `GET /locations/:locationId/inventory/:productId/movements/export` | `exportMovements` | L: `inventory.export` | — |
| `POST /locations/:locationId/inventory/documents` | `createDocument` | L: `inventory.manage` | — |
| `GET /locations/:locationId/inventory/documents` | `searchDocuments` | L: `inventory.read` | — |
| `GET /locations/:locationId/inventory/documents/status-counts` | `getDocumentStatusCounts` | L: `inventory.read` | — |
| `GET /locations/:locationId/inventory/documents/:documentId` | `findDocument` | L: `inventory.read` | — |
| `PUT /locations/:locationId/inventory/documents/:documentId` | `updateDocument` | L: `inventory.manage` | — |
| `PATCH /locations/:locationId/inventory/documents/:documentId/status` | `changeDocumentStatus` | L: `inventory.manage` | — |

## location

[Исходник](../../src/modules/location/controllers/location.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/options` | `options` | U: `reference` | — |
| `GET /locations/business-types` | `businessTypes` | U: `reference` | — |
| `POST /brands/:brandId/locations` | `create` | B: `location.create` | — |
| `GET /brands/:brandId/locations` | `listByBrand` | U: `accessible-locations` | Только филиалы, доступные пользователю; чужие исключаются до подсчёта и выдачи. |
| `GET /locations/:locationId` | `findById` | L: `location.read` | — |
| `PUT /locations/:locationId` | `update` | L: `location.settings.manage` | — |
| `GET /locations/:locationId/public` | `findPublic` | P: `public` | — |
| `DELETE /locations/:locationId` | `delete` | L: `location.settings.manage` | — |

## orders

[Исходник](../../src/modules/orders/controllers/orders.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/orders` | `create` | L: `order.create` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `GET /locations/:locationId/orders` | `search` | L: `order.read` | — |
| `GET /locations/:locationId/orders/status-counts` | `getStatusCounts` | L: `order.read` | — |
| `GET /locations/:locationId/orders/:orderId` | `findById` | L: `order.read` | — |
| `PUT /locations/:locationId/orders/:orderId` | `update` | L: `order.update` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `PATCH /locations/:locationId/orders/:orderId/status` | `changeStatus` | L: `order.void` | Текущий DTO допускает только VOIDED. Новые статусы потребуют явной проверки действия. |
| `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/confirm` | `confirmItem` | L: `order.confirm` | — |
| `POST /locations/:locationId/orders/:orderId/items` | `addItems` | L: `order.update` | Произвольная цена: дополнительно sale.price.override. Новый клиент: дополнительно client.create, если сценарий его создаёт. |
| `POST /locations/:locationId/orders/:orderId/items/confirm` | `confirmItems` | L: `order.confirm` | — |
| `PATCH /locations/:locationId/orders/:orderId/items/:orderItemId/reverse` | `reverseItem` | L: `order.return` | — |
| `POST /locations/:locationId/orders/:orderId/returns` | `createReturn` | L: `order.return` | — |
| `DELETE /locations/:locationId/orders/:orderId` | `delete` | L: `order.delete` | — |

## staff-compensation

[Исходник](../../src/modules/payroll/compensation/controllers/staff-compensation.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/staff/:id/compensation/current` | `current` | L: `payroll.read` | — |
| `GET /locations/:locationId/staff/:id/compensation` | `history` | L: `payroll.read` | — |
| `PUT /locations/:locationId/staff/:id/compensation` | `replace` | L: `payroll.manage` | — |

## staff-earnings

[Исходник](../../src/modules/payroll/earnings/controllers/staff-earnings.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/payroll/earnings` | `search` | L: `payroll.read` | — |
| `GET /locations/:locationId/staff/:id/earnings` | `listForStaff` | L: `payroll.read` | — |
| `POST /locations/:locationId/staff/:id/earnings` | `createManual` | L: `payroll.manage` | — |
| `POST /locations/:locationId/payroll/product-sales` | `recordProductSale` | L: `payroll.manage` | Создание комиссии без склада: payroll.manage, а не право обычной продажи. |

## payroll

[Исходник](../../src/modules/payroll/periods/controllers/payroll-periods.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/payroll/periods` | `create` | L: `payroll.manage` | — |
| `GET /locations/:locationId/payroll/locked-ranges` | `lockedRanges` | L: `payroll.read` | В текущем API это периоды блокировки ручных начислений; STAFF закрыто. |
| `GET /locations/:locationId/payroll/periods` | `search` | L: `payroll.read` | — |
| `GET /locations/:locationId/payroll/periods/status-counts` | `getStatusCounts` | L: `payroll.read` | — |
| `GET /locations/:locationId/payroll/periods/:id` | `findById` | L: `payroll.read` | — |
| `GET /locations/:locationId/payroll/periods/:id/report` | `report` | L: `payroll.read` | — |
| `GET /locations/:locationId/payroll/periods/:id/earnings` | `listPeriodEarnings` | L: `payroll.read` | — |
| `GET /locations/:locationId/payroll/periods/:id/export/vedomost` | `exportVedomost` | L: `payroll.export` | — |
| `GET /locations/:locationId/payroll/periods/:id/export/payslips` | `exportPayslips` | L: `payroll.export` | — |
| `POST /locations/:locationId/payroll/periods/:id/calculate` | `calculate` | L: `payroll.manage` | — |
| `POST /locations/:locationId/payroll/periods/:id/approve` | `approve` | L: `payroll.manage` | — |
| `POST /locations/:locationId/payroll/periods/:id/pay` | `pay` | L: `payroll.manage` | — |
| `DELETE /locations/:locationId/payroll/periods/:id` | `delete` | L: `payroll.manage` | — |
| `POST /locations/:locationId/payroll/results/:id/corrections` | `correct` | L: `payroll.manage` | — |

## products-analytics

[Исходник](../../src/modules/products/analytics/controllers/products-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/products/analytics` | `analytics` | L: `analytics.location.read` | Если результат включает зарплаты/складские данные — также payroll.read/inventory.read; весь запрос отклоняется при нехватке прав. |

## product-packaging

[Исходник](../../src/modules/products/controllers/product-packaging.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/products/:productId/packagings` | `create` | G: `product.packaging.manage` | — |
| `PATCH /brands/:brandId/products/:productId/packagings/:packagingId/status` | `changeStatus` | G: `product.packaging.manage` | — |

## products

[Исходник](../../src/modules/products/controllers/products.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/product-categories` | `createCategory` | G: `product.catalog.manage` | — |
| `GET /brands/:brandId/product-categories` | `listCategories` | G: `product.read` | — |
| `PUT /brands/:brandId/product-categories/:categoryId` | `updateCategory` | G: `product.catalog.manage` | — |
| `DELETE /brands/:brandId/product-categories/:categoryId` | `deleteCategory` | G: `product.catalog.manage` | — |
| `POST /brands/:brandId/products` | `create` | G: `product.catalog.manage` | — |
| `GET /brands/:brandId/products` | `search` | G: `product.read` | — |
| `GET /brands/:brandId/products/status-counts` | `getStatusCounts` | G: `product.read` | — |
| `GET /brands/:brandId/products/:productId` | `findById` | G: `product.read` | — |
| `PUT /brands/:brandId/products/:productId` | `update` | G: `product.catalog.manage` | — |
| `PATCH /brands/:brandId/products/:productId/status` | `changeStatus` | G: `product.catalog.manage` | — |
| `DELETE /brands/:brandId/products/:productId` | `delete` | G: `product.catalog.manage` | — |
| `PUT /locations/:locationId/products/:productId` | `upsertLocation` | L: `product.location.manage` | — |
| `GET /locations/:locationId/products` | `searchLocation` | L: `product.location.read` | — |

## services-analytics

[Исходник](../../src/modules/services/analytics/controllers/services-analytics.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/services/analytics` | `analytics` | L: `analytics.location.read` | Если результат включает зарплаты/складские данные — также payroll.read/inventory.read; весь запрос отклоняется при нехватке прав. |

## services

[Исходник](../../src/modules/services/controllers/services.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/service-categories` | `createCategory` | L: `service.manage` | — |
| `GET /locations/:locationId/service-categories` | `listCategories` | L: `service.read` | — |
| `PUT /locations/:locationId/service-categories/:categoryId` | `updateCategory` | L: `service.manage` | — |
| `DELETE /locations/:locationId/service-categories/:categoryId` | `deleteCategory` | L: `service.manage` | — |
| `POST /locations/:locationId/services` | `create` | L: `service.manage` | — |
| `PUT /locations/:locationId/services/:id` | `update` | L: `service.manage` | — |
| `GET /locations/:locationId/service-catalog/counts` | `getCatalogCounts` | L: `service.read` | — |
| `GET /locations/:locationId/service-catalog` | `searchCatalog` | L: `service.read` | — |
| `POST /locations/:locationId/service-bundles` | `createBundle` | L: `service.manage` | — |
| `GET /locations/:locationId/service-bundles/:id` | `findBundleById` | L: `service.read` | — |
| `PUT /locations/:locationId/service-bundles/:id` | `updateBundle` | L: `service.manage` | — |
| `PATCH /locations/:locationId/service-bundles/:id/status` | `updateBundleStatus` | L: `service.manage` | — |
| `DELETE /locations/:locationId/service-bundles/:id` | `deleteBundle` | L: `service.manage` | — |
| `GET /locations/:locationId/services/:id` | `findById` | L: `service.read` | — |
| `PATCH /locations/:locationId/services/:id/status` | `updateStatus` | L: `service.manage` | — |
| `DELETE /locations/:locationId/services/:id` | `delete` | L: `service.manage` | — |

## staff-kpi

[Исходник](../../src/modules/staff/kpi/controllers/staff-kpi.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /locations/:locationId/staff/widgets` | `getWidgets` | L: `analytics.location.read` | Если результат включает зарплаты/складские данные — также payroll.read/inventory.read; весь запрос отклоняется при нехватке прав. |

## staff

[Исходник](../../src/modules/staff/controllers/staff.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /locations/:locationId/staff` | `create` | L: `staff.manage` | — |
| `PUT /locations/:locationId/staff/:id` | `update` | L: `staff.manage` | — |
| `GET /locations/:locationId/staff/status-counts` | `getStatusCounts` | L: `staff.read` | — |
| `GET /locations/:locationId/staff/export` | `export` | L: `staff.export` | — |
| `GET /locations/:locationId/staff/:id` | `findById` | L: `staff.read` | — |
| `GET /locations/:locationId/staff` | `search` | L: `staff.read` | — |
| `PATCH /locations/:locationId/staff/:id/status` | `changeStatus` | L: `staff.manage` | — |
| `DELETE /locations/:locationId/staff/:id` | `delete` | L: `staff.manage` | — |
| `GET /locations/:locationId/staff/:id/shifts` | `getShifts` | L: `staff.read` | — |
| `PUT /locations/:locationId/staff/:id/shifts` | `replaceShifts` | L: `staff.manage` | — |

## suppliers

[Исходник](../../src/modules/suppliers/controllers/suppliers.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `POST /brands/:brandId/suppliers` | `create` | G: `supplier.manage` | — |
| `GET /brands/:brandId/suppliers` | `search` | G: `supplier.read` | — |
| `GET /brands/:brandId/suppliers/options` | `listOptions` | G: `supplier.read` | — |
| `GET /brands/:brandId/suppliers/:supplierId` | `findById` | G: `supplier.read` | — |
| `PUT /brands/:brandId/suppliers/:supplierId` | `update` | G: `supplier.manage` | — |
| `DELETE /brands/:brandId/suppliers/:supplierId` | `deactivate` | G: `supplier.manage` | — |

## user

[Исходник](../../src/modules/user/controllers/user.controller.ts)

| API | Метод | Проверка | Уточнение |
| --- | --- | --- | --- |
| `GET /users/me` | `me` | U: `own-account` | — |
| `PUT /users/me` | `updateMe` | U: `own-account` | — |
