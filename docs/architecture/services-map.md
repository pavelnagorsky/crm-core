# Карта компонентов

Актуализировано 2026-10-17. Начинай с публичного API домена, затем переходи к исполнителю конкретной операции. Экспортируемые провайдеры перечислены в соответствующем NestJS-модуле; расположение файла само по себе не делает его публичным.

## Бронирования и календарь

| Компонент | Ответственность |
| --- | --- |
| [BookingsFacade](../../src/modules/bookings/bookings.facade.ts) | Публичные операции чтения, настройки и изменения бронирований. |
| [BookingCreateFacade](../../src/modules/bookings/booking-create.facade.ts) | Публичное и ручное создание: права, выбор услуг, расписание, резервирование и уведомления. |
| BookingSelectionService | Выбор услуг/bundle и расчёт цен через публичный API каталога. |
| BookingSchedulingService | Интервалы услуг и подбор сотрудников. |
| BookingReservationService | Транзакция создания, блокировки слотов, календарь, заказ и начисления. |
| BookingMutationService | Редактирование клиента, заметок, цен и добавление товаров; перенос и жизненный цикл делегируются отдельным исполнителям. |
| BookingRescheduleService | Перенос интервалов и восстановление календарных событий при повторном открытии брони. |
| BookingLifecycleService | Статусы, завершение, отмена и удаление с финансовыми последствиями. |
| BookingSlotLockService / BookingWriteLockService | Блокировки сотрудников/дней и защита от устаревших изменений. |
| [CalendarFacade](../../src/modules/calendar/calendar.facade.ts) | Публичный API календарных событий и доступности. |
| CalendarAvailabilityService | Загрузка смен/событий и проверка доступности через вычислитель. |
| CalendarCalculator | Чистая обработка повторений, блокировок и свободных интервалов. Приватен для CalendarModule. |
| CalendarViewFacade | Сборка HTTP-представления календаря с данными бронирований через публичные API. |

Подробности: [booking-write-flows.md](./booking-write-flows.md).

## Заказы, склад и зарплата

| Компонент | Ответственность |
| --- | --- |
| [OrdersFacade](../../src/modules/orders/orders.facade.ts) | Публичные операции заказов и координация исполнителей. |
| OrderCreationService | Создание черновика или атомарное создание и проведение продажи. Повторы сериализуются по ключу запроса. |
| OrderDraftMutationService | Редактирование и удаление черновиков, добавление товаров, аудит после commit. |
| OrderDraftService | Проверка каталога/продавцов/клиентов и подготовка строк заказа. |
| OrderPersistenceService | Поиск, блокировки заказов и запросов, версии и пересчёт итогов. Приватен для OrdersModule. |
| OrderProductTransitionService | Проведение, сторнирование и аннулирование с движениями склада и начислениями. |
| OrderBookingSyncService | Согласование заказа с завершением или отменой бронирования. |
| OrderReturnService | Частичные возвраты товаров и соответствующие складские/зарплатные изменения. |
| OrderPricingCalculator / OrderStateRules | Чистые расчёты и проверки состояния; приватны для OrdersModule. Общая арифметика строк находится в shared/money/line-pricing.ts. |
| OrderAuditService | Публикация событий аудита заказов. События в памяти процесса не являются durable outbox. |
| [InventoryFacade](../../src/modules/inventory/inventory.facade.ts) | Публичные операции склада. |
| InventoryReadService | Поиск документов/движений и делегирование чтения остатков. |
| InventoryStockReadService | Страницы и счётчики остатков через InventoryStockView в БД. |
| InventoryDocumentService / InventoryDocumentMovementService | Черновики, проведение/аннулирование документов и формирование движений. |
| InventorySalesService / InventorySaleReversalService | Движения продаж и возвратов. |
| InventoryBalanceLockService | Блокировка остатков перед изменением. |
| InventoryValuationCalculator / InventoryDocumentItemCalculator | Чистые расчёты остатков, себестоимости и строк документов. |
| [PayrollPeriodService](../../src/modules/payroll/periods/services/payroll-period.service.ts) | Периоды, расчёт, утверждение, оплата и корректировки. |
| PayrollCalculationService | Подготовка исходных данных, материализация начислений и результатов. |
| PayrollPeriodLockService | Защита пересекающихся периодов и проверка версии после получения блокировки. |
| StaffEarningsService | Доменные операции начислений; публичный API PayrollModule. |
| StaffEarningWriterService | Идемпотентная вставка начислений и проверка закрытых дат. |
| ProductSaleEarningReversalService | Сторнирование комиссий с учётом частичных возвратов. |
| StaffCompensationService | Планы оплаты, ставки и история условий. |
| PayrollCalculator / EarningCalculator | Чистые денежные расчёты, приватные для PayrollModule. |

## Доступ, каталог, аналитика и инфраструктура

| Компонент | Ответственность |
| --- | --- |
| AccessManagementFacade | Пользовательские операции доступа, generic invitations и grants. |
| AccessService / AccessAdministrationService | Чтение эффективных прав и изменение политик/участников с проверкой полномочий. |
| PermissionCalculator | Чистый расчёт permissions, overrides и зависимостей. |
| AuthService / PasswordResetService | Сессии/OAuth и отдельный сценарий сброса пароля. |
| TokenEpochRegistryService | Отзыв JWT через атомарную версию в User; состояние сохраняется между перезапусками и узлами. |
| UserService | Пользователи и сохранённая версия токенов. |
| BrandService / LocationService | Бренды и филиалы. Изменения членства принадлежат AccessModule. |
| StaffService | Сотрудники, смены, выполняемые услуги и привязка профиля к доступу. |
| ClientsService | Клиенты, запреты публичной записи, поиск и разрешение клиента для бронирования. |
| ServiceCatalogReadService / ServiceCatalogItemFactory | Выбор страницы из ServiceCatalogView и построение карточек из данных владельцев. |
| [ServiceCatalogFacade](../../src/modules/services/catalog/service-catalog.facade.ts) | Единый публичный API чтения каталога для других доменов. |
| ServiceReadService / ServiceBundleReadService | Приватное чтение услуг и бандлов в ServiceCatalogModule. |
| ServiceCategoriesService | Чтение и изменение категорий, аудит; используется каталогом. |
| ServiceWriteService / ServiceBundleWriteService | Запись услуг и бандлов, статусы, удаление и аудит; не экспортируются. |
| ServicesAnalyticsService | Виджеты услуг через агрегаты бронирований; дочерний сценарий ServicesModule. |
| ProductsService | Товары, категории и настройки товаров по филиалам. |
| DashboardFacade / DashboardContextService | Координация виджетов и загрузка необходимых агрегатов. |
| DashboardWidgetFactory / DashboardMetricFactory / DashboardSeriesFactory / DashboardBucketFactory | Построение представлений и календарных интервалов без обращений к БД. |
| BookingsAggregatesService / OrdersAggregatesService | Read models аналитики принадлежащих им доменов. |
| AuditService / AuditRenderer | Хранение/чтение аудита и локализованное представление событий. |
| NotificationsService / EmailChannel / EmailRenderer | Обработка событий уведомлений, доставка email и рендеринг шаблонов. |
| FilesService | Метаданные файлов и интеграция с хранилищем. |
| MoneyUtils / UnitCostUtils / QuantityUtils / TimeUtils / XlsxUtils | Статические утилиты, не DI-сервисы. |

Иерархия модулей и восстановление SQL view: [services-catalog.md](./services-catalog.md).
