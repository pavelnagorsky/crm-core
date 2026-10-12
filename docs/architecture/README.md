# Архитектура

Эта папка - визуальная карта текущей структуры NestJS-приложения.

Документация собрана по коду 2026-10-12 и затем вручную уточнена по назначению сервисов. Это живая документация: если у сервиса меняется зона ответственности, обновляй соответствующую строку и диаграмму в том же PR.

## Как Читать

- [services-map.md](./services-map.md) отвечает на вопрос: "Какой сервис открыть первым?"
- [domain-ownership.md](./domain-ownership.md) отвечает на вопрос: "Кто владеет этими данными и кто может читать их напрямую?"
- [flows.md](./flows.md) отвечает на вопрос: "Что происходит в основных бизнес-сценариях?"

## Карта Модулей

```mermaid
flowchart LR
  AppModule --> AuthModule
  AppModule --> BrandModule
  AppModule --> LocationModule
  AppModule --> StaffModule
  AppModule --> ServicesModule
  AppModule --> CalendarApiModule
  AppModule --> ClientsModule
  AppModule --> BookingsModule
  AppModule --> BookingChannelsModule
  AppModule --> OrdersModule
  AppModule --> ProductsModule
  AppModule --> InventoryModule
  AppModule --> PayrollModule
  AppModule --> DashboardModule
  AppModule --> AuditModule
  AppModule --> FilesModule

  LocationModule --> BrandModule
  StaffModule --> ServicesModule
  StaffModule --> LocationModule
  CalendarModule --> LocationModule
  CalendarModule --> StaffModule
  CalendarModule --> ServicesModule
  CalendarApiModule --> CalendarModule
  CalendarApiModule --> BookingsModule
  CalendarApiModule --> LocationModule

  BookingsModule --> LocationModule
  BookingsModule --> CalendarModule
  BookingsModule --> ClientsModule
  BookingsModule --> StaffModule
  BookingsModule --> PayrollModule
  BookingsModule --> ServicesModule
  BookingsModule --> OrdersModule

  BookingChannelsModule --> LocationModule
  BookingChannelsModule --> ServicesModule
  BookingChannelsModule --> FilesModule
  BookingChannelsModule --> BookingsModule

  OrdersModule --> ProductsModule
  OrdersModule --> InventoryModule
  OrdersModule --> StaffModule
  OrdersModule --> PayrollModule
  OrdersModule --> ClientsModule
  OrdersModule --> LocationModule

  InventoryModule --> ProductsModule
  InventoryModule --> LocationModule
  PayrollModule --> StaffModule
  PayrollModule --> LocationModule
  PayrollModule --> ServicesModule
```

## Слои

```mermaid
flowchart TB
  Controller[Controllers\nHTTP и DTO mapping]
  Facade[Facade services\nпубличные операции домена]
  Domain[Domain services\nread/write workflow]
  Compute[Compute/factory services\nчистые вычисления]
  Persistence[DatabaseService / Prisma]

  Controller --> Facade
  Facade --> Domain
  Domain --> Compute
  Domain --> Persistence
```

Полезная модель при чтении модуля:

- Controllers принимают HTTP, валидируют DTO и мапят ответ.
- Facade services дают наружу именованные операции домена.
- Domain services оркестрируют запись/чтение и вызовы публичных API других модулей.
- Compute/factory services должны оставаться чистыми или почти чистыми.
- Cross-domain доступ идет через экспортированный сервис владельца домена.
