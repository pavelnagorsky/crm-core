# Бизнес-Сценарии

Диаграммы показывают основные orchestration paths. DTO mapping и guards намеренно скрыты, чтобы было проще увидеть ответственность сервисов.

## Публичное Создание Брони

```mermaid
sequenceDiagram
  participant PublicController as PublicBookingCreateController
  participant Attribution as BookingChannelAttributionService
  participant Create as BookingCreateFacade
  participant Selection as BookingSelectionService
  participant Scheduling as BookingSchedulingService
  participant Reservation as BookingReservationService
  participant Slots as BookingSlotLockService
  participant Catalog as ServiceCatalogFacade
  participant Clients as ClientsService
  participant Staff as StaffService
  participant Calendar as CalendarFacade
  participant Orders as OrdersFacade
  participant Earnings as StaffEarningsService
  participant DB as DatabaseService

  PublicController->>Attribution: resolve(page/widget)
  PublicController->>Create: createPublicBooking()
  Create->>Selection: resolve()
  Selection->>Catalog: resolveServicesForBooking() / resolveBundleForBooking()
  Create->>Clients: resolveForBooking()
  Create->>Scheduling: resolveForBooking()
  Scheduling->>Staff: resolveStaffForService()
  Scheduling->>Calendar: filterAvailableStaff()
  Create->>Reservation: reserve()
  Reservation->>Slots: lock staff days and recheck availability
  Reservation->>Calendar: createBookingEvent() in transaction
  Reservation->>DB: create booking and booking items
  Note over Reservation,DB: Заказ и начисления синхронизируются только для соответствующего сценария создания
  Reservation->>Orders: sync completed booking / add draft products when applicable
  Reservation->>Earnings: record when booking work is completed
```

## Ручное Управление Бронью

```mermaid
flowchart LR
  BookingsController --> BookingsFacade
  BookingsFacade --> BookingReadService
  BookingsFacade --> BookingMutationService
  BookingsFacade --> BookingSetupService
  BookingsController --> BookingCreateFacade
  BookingsController --> BookingsExportService

  BookingMutationService --> BookingRescheduleService
  BookingMutationService --> BookingLifecycleService
  BookingMutationService --> OrdersFacade
  BookingMutationService --> StaffEarningsService
  BookingRescheduleService --> CalendarFacade
  BookingLifecycleService --> CalendarFacade
  BookingCreateFacade --> BookingSchedulingService
  BookingCreateFacade --> BookingReservationService
  BookingCreateFacade --> ClientsService
  BookingSchedulingService --> StaffService
  BookingSchedulingService --> CalendarFacade
  BookingCreateFacade --> BookingSelectionService
  BookingSelectionService --> ServiceCatalogFacade
  BookingMutationService --> BookingEventsService
```

## Календарь И Доступность

```mermaid
flowchart TB
  CalendarController --> CalendarViewFacade
  CalendarViewFacade --> CalendarFacade
  CalendarViewFacade --> BookingCalendarReadService

  CalendarFacade --> CalendarEventService
  CalendarFacade --> BookingCalendarEventService
  CalendarFacade --> CalendarAvailabilityService
  CalendarFacade --> CalendarViewBuilderService

  CalendarAvailabilityService --> StaffService
  CalendarAvailabilityService --> ServiceCatalogFacade
  CalendarAvailabilityService --> CalendarCalculator
  CalendarViewBuilderService --> CalendarCalculator
```

## Заказ С Продажей Товара

```mermaid
sequenceDiagram
  participant Controller as OrdersController
  participant Orders as OrdersFacade
  participant Draft as OrderDraftService
  participant Transition as OrderProductTransitionService
  participant Inventory as InventoryFacade
  participant Earnings as StaffEarningsService
  participant Persistence as OrderPersistenceService
  participant Audit as OrderAuditService
  participant AuditStore as AuditService

  Controller->>Orders: create/update/confirm
  Orders->>Draft: resolve draft lines and prices
  Orders->>Persistence: create or update order
  Orders->>Transition: confirm product items
  Transition->>Inventory: postSale()
  Transition->>Earnings: recordForProductOrder()
  Transition->>Persistence: refresh totals/state
  Transition->>Audit: write transition event
  Audit->>AuditStore: writeInTransaction()
```

## Возврат По Заказу

```mermaid
sequenceDiagram
  participant Orders as OrdersFacade
  participant Return as OrderReturnService
  participant Inventory as InventoryFacade
  participant Earnings as StaffEarningsService
  participant Persistence as OrderPersistenceService
  participant Audit as OrderAuditService
  participant AuditStore as AuditService

  Orders->>Return: create()
  Return->>Persistence: load and lock order
  Return->>Inventory: reverseSaleItem()/reverseSaleItemQuantity()
  Return->>Earnings: reverseForProductOrderItem()
  Return->>Persistence: refresh totals
  Return->>Audit: write return event
  Audit->>AuditStore: writeInTransaction()
```

## Расчет Зарплаты

```mermaid
flowchart LR
  PayrollPeriodsController --> PayrollPeriodService
  PayrollPeriodsController --> PayrollReportService
  PayrollPeriodsController --> StaffEarningsService

  PayrollPeriodService --> PayrollCalculationService
  PayrollCalculationService --> StaffEarningsService
  PayrollCalculationService --> StaffCompensationService
  PayrollCalculationService --> PayrollCalculator
  PayrollCalculationService --> StaffService
  PayrollPeriodService --> LocationService

  StaffEarningsService --> StaffCompensationService
  StaffEarningsService --> EarningCalculator
  StaffEarningsService --> StaffEarningWriterService
  PayrollCalculator --> EarningCalculator
```

## Паттерн Аналитики

```mermaid
flowchart TB
  DashboardController --> DashboardFacade
  ServicesAnalyticsController --> ServicesAnalyticsService
  BookingsAnalyticsController --> BookingsAnalyticsService
  ClientsAnalyticsController --> ClientsAnalyticsService
  ProductsAnalyticsController --> ProductsAnalyticsService

  DashboardFacade --> BookingsAggregatesService
  DashboardFacade --> OrdersAggregatesService

  ServicesAnalyticsService --> BookingsAggregatesService
  BookingsAnalyticsService --> BookingsAggregatesService
  ClientsAnalyticsService --> BookingsAggregatesService
  ClientsAnalyticsService --> OrdersAggregatesService
  ProductsAnalyticsService --> OrdersAggregatesService

  DashboardFacade --> DashboardRangeService
  ServicesAnalyticsService --> DashboardRangeService
  BookingsAnalyticsService --> DashboardRangeService
  ClientsAnalyticsService --> DashboardRangeService
  ProductsAnalyticsService --> DashboardRangeService
```
