import { Module } from '@nestjs/common';
import { BookingsAggregatesModule } from '../bookings/aggregates/bookings-aggregates.module.js';
import { LocationModule } from '../location/location.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsAggregatesModule } from '../payments/aggregates/payments-aggregates.module.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { DashboardFacade } from './dashboard.facade.js';
import { DashboardBucketFactory } from './factories/dashboard-bucket.factory.js';
import { DashboardMetricFactory } from './factories/dashboard-metric.factory.js';
import { DashboardSeriesFactory } from './factories/dashboard-series.factory.js';
import { DashboardWidgetFactory } from './factories/dashboard-widget.factory.js';
import { DashboardContextService } from './services/dashboard-context.service.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';
import { FinanceSummaryService } from './services/finance-summary.service.js';

@Module({
  imports: [
    BookingsAggregatesModule,
    LocationModule,
    OrdersModule,
    PaymentsAggregatesModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardContextService,
    DashboardWidgetFactory,
    DashboardFacade,
    DashboardRangeService,
    DashboardBucketFactory,
    DashboardMetricFactory,
    DashboardSeriesFactory,
    FinanceSummaryService,
  ],
  exports: [
    DashboardRangeService,
    DashboardBucketFactory,
    DashboardMetricFactory,
    DashboardSeriesFactory,
  ],
})
export class DashboardModule {}
