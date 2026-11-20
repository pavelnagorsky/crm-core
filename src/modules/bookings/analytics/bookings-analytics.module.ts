import { Module } from '@nestjs/common';
import { I18nModule } from '../../../shared/i18n/i18n.module.js';
import { BookingTrafficModule } from '../../booking-traffic/booking-traffic.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { BookingsAggregatesModule } from '../aggregates/bookings-aggregates.module.js';
import { BookingsAnalyticsController } from './controllers/bookings-analytics.controller.js';
import { BookingsAnalyticsService } from './services/bookings-analytics.service.js';

@Module({
  imports: [
    BookingsAggregatesModule,
    BookingTrafficModule,
    DashboardModule,
    I18nModule,
    StaffModule,
  ],
  controllers: [BookingsAnalyticsController],
  providers: [BookingsAnalyticsService],
})
export class BookingsAnalyticsModule {}
