import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { appRole, runsCrons } from './config/app-role.config.js';
import configuration from './config/configuration.js';
import { loggerConfig } from './config/logger.config.js';
import { throttlerConfig } from './config/throttler.config.js';
import { DatabaseModule } from './database/database.module.js';
import { AccessManagementModule } from './modules/access-management/access-management.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingChannelsModule } from './modules/booking-channels/booking-channels.module.js';
import { BookingsAnalyticsModule } from './modules/bookings/analytics/bookings-analytics.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { BrandApiModule } from './modules/brand/api/brand-api.module.js';
import { CalendarApiModule } from './modules/calendar/api/calendar-api.module.js';
import { ClientsAnalyticsModule } from './modules/clients/analytics/clients-analytics.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { BillingAdminModule } from './modules/billing/admin/billing-admin.module.js';
import { BillingOwnerModule } from './modules/billing/owner/billing-owner.module.js';
import { BillingJobsModule } from './modules/billing/jobs/billing-jobs.module.js';
import { FeedbackModule } from './modules/feedback/feedback.module.js';
import { SupportModule } from './modules/support/support.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InventoryAnalyticsModule } from './modules/inventory/analytics/inventory-analytics.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LocationModule } from './modules/location/location.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PayrollModule } from './modules/payroll/payroll.module.js';
import { ProductsAnalyticsModule } from './modules/products/analytics/products-analytics.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ReviewImportModule } from './modules/reviews/import/review-import.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { CronModule } from './shared/cron/cron.module.js';
import { AppThrottlerGuard } from './shared/guards/app-throttler.guard.js';
import { RedisModule } from './shared/redis/redis.module.js';
import { ThrottlerStorageModule } from './shared/throttling/throttler-storage.module.js';
import { THROTTLER_STORAGE } from './shared/throttling/throttler-storage.token.js';

@Module({
  imports: [
    AccessManagementModule,
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      cache: true,
    }),
    // Read at import time (main.ts loads `dotenv/config` before AppModule). Without ScheduleModule, `@Cron` stays inert metadata.
    ...(runsCrons(appRole()) ? [ScheduleModule.forRoot()] : []),
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [THROTTLER_STORAGE],
      useFactory: (storage: ThrottlerStorage) => ({
        ...throttlerConfig,
        storage,
      }),
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: loggerConfig,
    }),
    EventEmitterModule.forRoot({ wildcard: true }),
    DatabaseModule,
    RedisModule,
    CronModule,
    NotificationsModule,
    AuthModule,
    BrandApiModule,
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
    FeedbackModule,
    BillingOwnerModule,
    BillingAdminModule,
    BillingJobsModule,
    SupportModule,
    ReviewImportModule,
    DashboardModule,
    PayrollModule,
    ProductsModule,
    ProductsAnalyticsModule,
    SuppliersModule,
    InventoryModule,
    InventoryAnalyticsModule,
    OrdersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
