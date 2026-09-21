import { Module } from '@nestjs/common';
import { ServicesAnalyticsService } from './services-analytics.service.js';
import { ServicesAnalyticsController } from './services-analytics.controller.js';
import { ServicesModule } from '../services.module.js';
import { BookingsModule } from '../../bookings/bookings.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';

@Module({
  imports: [ServicesModule, BookingsModule, DashboardModule],
  controllers: [ServicesAnalyticsController],
  providers: [ServicesAnalyticsService],
})
export class ServicesAnalyticsModule {}
