import { Module } from '@nestjs/common';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { BookingsAggregatesModule } from '../aggregates/bookings-aggregates.module.js';
import { BookingsAnalyticsController } from './controllers/bookings-analytics.controller.js';
import { BookingsAnalyticsService } from './services/bookings-analytics.service.js';

@Module({
  imports: [BookingsAggregatesModule, DashboardModule, StaffModule],
  controllers: [BookingsAnalyticsController],
  providers: [BookingsAnalyticsService],
})
export class BookingsAnalyticsModule {}
