import { Module } from '@nestjs/common';
import { BookingsAnalyticsService } from './bookings-analytics.service.js';
import { BookingsAnalyticsController } from './bookings-analytics.controller.js';
import { BookingsAggregatesModule } from '../aggregates/bookings-aggregates.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { StaffModule } from '../../staff/staff.module.js';

@Module({
  imports: [BookingsAggregatesModule, DashboardModule, StaffModule],
  controllers: [BookingsAnalyticsController],
  providers: [BookingsAnalyticsService],
})
export class BookingsAnalyticsModule {}
