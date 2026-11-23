import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { LocationModule } from '../location/location.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { PriceLevelTablesController } from './controllers/price-level-tables.controller.js';
import { PriceLevelsController } from './controllers/price-levels.controller.js';
import { PricingPreviewController } from './controllers/pricing-preview.controller.js';
import { PricingSettingsController } from './controllers/pricing-settings.controller.js';
import { ServicePricesController } from './controllers/service-prices.controller.js';
import { PriceRuleTargetCleanupListener } from './listeners/price-rule-target-cleanup.listener.js';
import { PricingFacade } from './pricing.facade.js';
import { PriceLevelFillService } from './services/price-level-fill.service.js';
import { PriceLevelMatrixService } from './services/price-level-matrix.service.js';
import { PriceLevelReadService } from './services/price-level-read.service.js';
import { PriceLevelsService } from './services/price-levels.service.js';
import { PriceRoundingPreviewService } from './services/price-rounding-preview.service.js';
import { PriceRuleCatalogService } from './services/price-rule-catalog.service.js';
import { PriceRulePreviewService } from './services/price-rule-preview.service.js';
import { PriceRuleReadService } from './services/price-rule-read.service.js';
import { PriceRulesService } from './services/price-rules.service.js';
import { PricingSnapshotService } from './services/pricing-snapshot.service.js';
import { ServicePricesService } from './services/service-prices.service.js';

/** Prices and promotions (docs/pricing-plan.md). Depends on no booking or order module. */
@Module({
  imports: [AppCacheModule, LocationModule, ServiceCatalogModule, StaffModule],
  controllers: [
    PriceLevelsController,
    PriceLevelTablesController,
    PricingPreviewController,
    ServicePricesController,
    PricingSettingsController,
  ],
  providers: [
    PricingFacade,
    PricingSnapshotService,
    PriceLevelReadService,
    PriceLevelsService,
    PriceLevelMatrixService,
    PriceLevelFillService,
    PriceRoundingPreviewService,
    PriceRulePreviewService,
    PriceRuleReadService,
    PriceRuleCatalogService,
    PriceRulesService,
    PriceRuleTargetCleanupListener,
    ServicePricesService,
  ],
  exports: [PricingFacade, PricingSnapshotService, PriceRulesService],
})
export class PricingModule {}
