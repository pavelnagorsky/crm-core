import { Module } from '@nestjs/common';
import { I18nModule } from '../../../shared/i18n/i18n.module.js';
import { ClientsModule } from '../clients.module.js';
import { BookingsAggregatesModule } from '../../bookings/aggregates/bookings-aggregates.module.js';
import { DashboardModule } from '../../dashboard/dashboard.module.js';
import { OrdersModule } from '../../orders/orders.module.js';
import { ClientsAnalyticsController } from './controllers/clients-analytics.controller.js';
import { ClientsAnalyticsService } from './services/clients-analytics.service.js';

@Module({
  imports: [
    BookingsAggregatesModule,
    ClientsModule,
    DashboardModule,
    I18nModule,
    OrdersModule,
  ],
  controllers: [ClientsAnalyticsController],
  providers: [ClientsAnalyticsService],
})
export class ClientsAnalyticsModule {}
