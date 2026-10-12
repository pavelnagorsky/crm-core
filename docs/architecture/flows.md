# Бизнес-Сценарии

Диаграммы показывают основные orchestration paths. DTO mapping и guards намеренно скрыты, чтобы было проще увидеть ответственность сервисов.

## Публичное Создание Брони

```mermaid
sequenceDiagram
  participant PublicController as PublicBookingCreateController
  participant Attribution as BookingChannelAttributionService
  participant Create as BookingCreateService
  participant Services as ServicesService
  participant Bundles as ServiceBundleService
  participant Clients as ClientsService
  participant Staff as StaffService
  participant Calendar as CalendarService
  participant Orders as OrdersService
  participant Earnings as StaffEarningsService
  participant DB as DatabaseService

  PublicController->>Attribution: resolve(page/widget)
  PublicController->>Create: createPublicBooking()
  Create->>Services: resolveActiveForBooking()
  Create->>Bundles: resolveActiveForBooking()
  Create->>Clients: resolveForBooking()
  Create->>Staff: resolveStaffingForServices()
  Create->>Calendar: isSlotFree() / createBookingEvent()
  Create->>DB: create booking and booking items
  Create->>Orders: sync/create related order state
  Create->>Earnings: record when booking work is completed
```

## Ручное Управление Бронью

```mermaid
flowchart LR
  BookingsController --> BookingsService
  BookingsService --> BookingReadService
  BookingsService --> BookingMutationService
  BookingsService --> BookingSetupService
  BookingsController --> BookingCreateService
  BookingsController --> BookingsExportService

  BookingMutationService --> CalendarService
  BookingMutationService --> OrdersService
  BookingMutationService --> StaffEarningsService
  BookingCreateService --> CalendarService
  BookingCreateService --> ClientsService
  BookingCreateService --> StaffService
  BookingCreateService --> ServicesService
  BookingCreateService --> ServiceBundleService
  BookingMutationService --> AuditService
```

## Календарь И Доступность

```mermaid
flowchart TB
  CalendarController --> CalendarViewService
  CalendarViewService --> CalendarService
  CalendarViewService --> BookingCalendarReadService

  CalendarService --> CalendarEventService
  CalendarService --> BookingCalendarEventService
  CalendarService --> CalendarAvailabilityService
  CalendarService --> CalendarViewBuilderService

  CalendarAvailabilityService --> StaffService
  CalendarAvailabilityService --> ServicesService
  CalendarAvailabilityService --> ServiceBundleService
  CalendarAvailabilityService --> CalendarComputeService
  CalendarViewBuilderService --> CalendarComputeService
```

## Заказ С Продажей Товара

```mermaid
sequenceDiagram
  participant Controller as OrdersController
  participant Orders as OrdersService
  participant Draft as OrderDraftService
  participant Transition as OrderProductTransitionService
  participant Inventory as InventoryService
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
  participant Orders as OrdersService
  participant Return as OrderReturnService
  participant Inventory as InventoryService
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
  PayrollController --> PayrollService
  PayrollController --> PayrollReportService
  PayrollController --> StaffEarningsService

  PayrollService --> StaffEarningsService
  PayrollService --> StaffCompensationService
  PayrollService --> PayrollComputeService
  PayrollService --> StaffService
  PayrollService --> LocationService

  StaffEarningsService --> StaffCompensationService
  StaffEarningsService --> EarningCalculatorService
  StaffEarningsService --> StaffEarningWriterService
  PayrollComputeService --> EarningCalculatorService
```

## Паттерн Аналитики

```mermaid
flowchart TB
  DashboardController --> DashboardService
  ServicesAnalyticsController --> ServicesAnalyticsService
  BookingsAnalyticsController --> BookingsAnalyticsService
  ClientsAnalyticsController --> ClientsAnalyticsService
  ProductsAnalyticsController --> ProductsAnalyticsService

  DashboardService --> BookingsAggregatesService
  DashboardService --> OrdersAggregatesService

  ServicesAnalyticsService --> BookingsAggregatesService
  BookingsAnalyticsService --> BookingsAggregatesService
  ClientsAnalyticsService --> BookingsAggregatesService
  ClientsAnalyticsService --> OrdersAggregatesService
  ProductsAnalyticsService --> OrdersAggregatesService

  DashboardService --> DashboardRangeService
  ServicesAnalyticsService --> DashboardRangeService
  BookingsAnalyticsService --> DashboardRangeService
  ClientsAnalyticsService --> DashboardRangeService
  ProductsAnalyticsService --> DashboardRangeService
```
