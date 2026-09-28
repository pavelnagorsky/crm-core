import { Module } from '@nestjs/common';
import { BookingsAnalyticsService } from './bookings-analytics.service.js';
import { BookingsAnalyticsController } from './bookings-analytics.controller.js';
import { BookingsModule } from '../bookings.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { StaffModule } from '../../staff/staff.module.js';

@Module({
  imports: [BookingsModule, DashboardModule, StaffModule],
  controllers: [BookingsAnalyticsController],
  providers: [BookingsAnalyticsService],
})
export class BookingsAnalyticsModule {}
