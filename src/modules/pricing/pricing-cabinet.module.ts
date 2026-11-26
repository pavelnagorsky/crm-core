import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LocationModule } from '../location/location.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { PriceCheckController } from './controllers/price-check.controller.js';
import { PriceRulesController } from './controllers/price-rules.controller.js';
import { PricingModule } from './pricing.module.js';
import { PriceAnalyticsExportService } from './services/price-analytics-export.service.js';
import { PriceAnalyticsService } from './services/price-analytics.service.js';
import { PriceExplainService } from './services/price-explain.service.js';
import { PriceWeekMapService } from './services/price-week-map.service.js';
import { PromotionProductStatsService } from './services/promotion-product-stats.service.js';
import { PromotionReportService } from './services/promotion-report.service.js';

/**
 * Cabinet endpoints that join pricing with bookings and sales (rule stats, the promotion
 * page, the price check with "any staff" and products) and the warehouse (last purchase
 * costs). Pricing itself depends on no booking code and BookingsModule imports it, so these
 * controllers live in a module that imports both.
 */
@Module({
  imports: [
    PricingModule,
    BookingsModule,
    DashboardModule,
    InventoryModule,
    LocationModule,
    OrdersModule,
    StaffModule,
  ],
  controllers: [PriceRulesController, PriceCheckController],
  providers: [
    PriceAnalyticsService,
    PriceAnalyticsExportService,
    PriceExplainService,
    PriceWeekMapService,
    PromotionProductStatsService,
    PromotionReportService,
  ],
})
export class PricingCabinetModule {}
