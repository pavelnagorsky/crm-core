import { Module } from '@nestjs/common';
import { ServicesAnalyticsService } from './services-analytics.service.js';
import { ServicesAnalyticsController } from './services-analytics.controller.js';
import { ServicesModule } from '../services.module.js';
import { BookingsAggregatesModule } from '../../bookings/aggregates/bookings-aggregates.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';

@Module({
  imports: [ServicesModule, BookingsAggregatesModule, DashboardModule],
  controllers: [ServicesAnalyticsController],
  providers: [ServicesAnalyticsService],
})
export class ServicesAnalyticsModule {}
