import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../../bookings/aggregates/bookings-aggregates.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { OrdersModule } from '../../orders/orders.module.js';
import { ProductsAnalyticsController } from './controllers/products-analytics.controller.js';
import { ProductsAnalyticsService } from './services/products-analytics.service.js';

@Module({
  imports: [BookingsAggregatesModule, DashboardModule, OrdersModule],
  controllers: [ProductsAnalyticsController],
  providers: [ProductsAnalyticsService],
})
export class ProductsAnalyticsModule {}
