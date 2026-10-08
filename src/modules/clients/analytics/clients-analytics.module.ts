import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../../bookings/aggregates/bookings-aggregates.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { OrdersModule } from '../../orders/orders.module.js';
import { ClientsAnalyticsController } from './clients-analytics.controller.js';
import { ClientsAnalyticsService } from './clients-analytics.service.js';

@Module({
  imports: [BookingsAggregatesModule, DashboardModule, OrdersModule],
  controllers: [ClientsAnalyticsController],
  providers: [ClientsAnalyticsService],
})
export class ClientsAnalyticsModule {}
