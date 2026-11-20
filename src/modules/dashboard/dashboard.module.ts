import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { BookingsAggregatesModule } from '../bookings/aggregates/bookings-aggregates.module.js';
import { LocationModule } from '../location/location.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { DashboardFacade } from './dashboard.facade.js';
import { DashboardBucketFactory } from './factories/dashboard-bucket.factory.js';
import { DashboardMetricFactory } from './factories/dashboard-metric.factory.js';
import { DashboardSeriesFactory } from './factories/dashboard-series.factory.js';
import { DashboardWidgetFactory } from './factories/dashboard-widget.factory.js';
import { DashboardContextService } from './services/dashboard-context.service.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';

@Module({
  imports: [BookingsAggregatesModule, I18nModule, LocationModule, OrdersModule],
  controllers: [DashboardController],
  providers: [
    DashboardContextService,
    DashboardWidgetFactory,
    DashboardFacade,
    DashboardRangeService,
    DashboardBucketFactory,
    DashboardMetricFactory,
    DashboardSeriesFactory,
  ],
  exports: [
    DashboardRangeService,
    DashboardBucketFactory,
    DashboardMetricFactory,
    DashboardSeriesFactory,
  ],
})
export class DashboardModule {}
