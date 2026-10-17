import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { AccessManagementModule } from './modules/access-management/access-management.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingChannelsModule } from './modules/booking-channels/booking-channels.module.js';
import { BookingsAnalyticsModule } from './modules/bookings/analytics/bookings-analytics.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { BrandModule } from './modules/brand/brand.module.js';
import { CalendarApiModule } from './modules/calendar/api/calendar-api.module.js';
import { ClientsAnalyticsModule } from './modules/clients/analytics/clients-analytics.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InventoryAnalyticsModule } from './modules/inventory/analytics/inventory-analytics.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LocationModule } from './modules/location/location.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { ProductsAnalyticsModule } from './modules/products/analytics/products-analytics.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';

@Module({
  imports: [
    AccessManagementModule,
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      cache: true,
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true }),
    DatabaseModule,
    NotificationsModule,
    AuthModule,
    BrandModule,
    LocationModule,
    StaffModule,
    ServicesModule,
    CalendarApiModule,
    ClientsModule,
    ClientsAnalyticsModule,
    BookingsModule,
    BookingChannelsModule,
    BookingsAnalyticsModule,
    AuditModule,
    HealthModule,
    FilesModule,
    DashboardModule,
    PayrollModule,
    ProductsModule,
    ProductsAnalyticsModule,
    SuppliersModule,
    InventoryModule,
    InventoryAnalyticsModule,
    OrdersModule,
  ],
})
export class AppModule {}
