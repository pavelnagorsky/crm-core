import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardBucketService } from './services/dashboard-bucket.service.js';
import { DashboardMetricFactory } from './services/dashboard-metric.factory.js';
import { DashboardRangeService } from './services/dashboard-range.service.js';
import { DashboardSeriesFactory } from './services/dashboard-series.factory.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { LocationModule } from '../location/location.module.js';

@Module({
  imports: [BookingsModule, LocationModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardRangeService,
    DashboardBucketService,
    DashboardMetricFactory,
    DashboardSeriesFactory,
  ],
  exports: [
    DashboardRangeService,
    DashboardBucketService,
    DashboardMetricFactory,
    DashboardSeriesFactory,
  ],
})
export class DashboardModule {}
