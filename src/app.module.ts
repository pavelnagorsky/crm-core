import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from './config/configuration.js';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { TimeModule } from './modules/time/time.module.js';
import { BusinessModule } from './modules/business/business.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { ServicesAnalyticsModule } from './modules/services/analytics/services-analytics.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      cache: true,
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 3 * 60 * 60 * 1000, // 3h
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true }),
    DatabaseModule,
    TimeModule,
    NotificationsModule,
    AuthModule,
    BusinessModule,
    StaffModule,
    ServicesModule,
    ServicesAnalyticsModule,
    CalendarModule,
    ClientsModule,
    BookingsModule,
    AuditModule,
    HealthModule,
    FilesModule,
    DashboardModule,
  ],
})
export class AppModule {}
