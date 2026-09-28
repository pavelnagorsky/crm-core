import { Module } from '@nestjs/common';
import { BookingsModule } from '../../bookings/bookings.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { ClientsAnalyticsController } from './clients-analytics.controller.js';
import { ClientsAnalyticsService } from './clients-analytics.service.js';

@Module({
  imports: [BookingsModule, DashboardModule],
  controllers: [ClientsAnalyticsController],
  providers: [ClientsAnalyticsService],
})
export class ClientsAnalyticsModule {}
