import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../../bookings/aggregates/bookings-aggregates.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { ServicesAnalyticsController } from './controllers/services-analytics.controller.js';
import { ServicesAnalyticsService } from './services/services-analytics.service.js';

@Module({
  imports: [BookingsAggregatesModule, DashboardModule],
  controllers: [ServicesAnalyticsController],
  providers: [ServicesAnalyticsService],
})
export class ServicesAnalyticsModule {}
