import { Module } from '@nestjs/common';
import { ServicesService } from './services.service.js';
import { ServicesAnalyticsService } from './services-analytics.service.js';
import { ServicesController } from './services.controller.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';

@Module({
  imports: [BookingsModule, DashboardModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServicesAnalyticsService],
})
export class ServicesModule {}
