import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { LocationModule } from '../location/location.module.js';
import { UserModule } from '../user/user.module.js';
import { ServiceWriteModule } from '../services/service-write/service-write.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { ServicePriceImportController } from './controllers/service-price-import.controller.js';
import { ServicePriceChangesController } from './controllers/service-price-changes.controller.js';
import { ServicePriceChangeApplier } from './services/service-price-change-applier.service.js';
import { ServicePriceChangeCron } from './services/service-price-change.cron.js';
import { ServicePriceChangeLock } from './services/service-price-change-lock.service.js';
import { ServicePriceChangePreviewService } from './services/service-price-change-preview.service.js';
import { ServicePriceChangeReadService } from './services/service-price-change-read.service.js';
import { ServicePriceChangeStore } from './services/service-price-change-store.service.js';
import { ServicePriceChangeWriter } from './services/service-price-change-writer.service.js';
import { ServicePriceChangesService } from './services/service-price-changes.service.js';
import { PriceLevelTablesController } from './controllers/price-level-tables.controller.js';
import { PriceLevelsController } from './controllers/price-levels.controller.js';
import { PricingPreviewController } from './controllers/pricing-preview.controller.js';
import { PricingSettingsController } from './controllers/pricing-settings.controller.js';
import { PublicPromotionsController } from './controllers/public-promotions.controller.js';
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
import { PromotionExportService } from './services/promotion-export.service.js';
import { PromotionPublicService } from './services/promotion-public.service.js';
import { ScheduledPriceChangeReadService } from './services/scheduled-price-change-read.service.js';
import { ServicePriceExportService } from './services/service-price-export.service.js';
import { ServicePriceImportService } from './services/service-price-import.service.js';
import { ServicePriceSheetService } from './services/service-price-sheet.service.js';
import { ServicePricesService } from './services/service-prices.service.js';

/** Prices and promotions (docs/pricing-plan.md). Depends on no booking or order module. */
@Module({
  imports: [AppCacheModule, LocationModule, ServiceCatalogModule, ServiceWriteModule, StaffModule, UserModule],
  controllers: [
    PriceLevelsController,
    PriceLevelTablesController,
    PricingPreviewController,
    ServicePricesController,
    ServicePriceImportController,
    ServicePriceChangesController,
    PricingSettingsController,
    PublicPromotionsController,
  ],
  providers: [
    PricingFacade,
    PricingSnapshotService,
    ScheduledPriceChangeReadService,
    ServicePriceChangeApplier,
    ServicePriceChangeCron,
    ServicePriceChangeLock,
    ServicePriceChangePreviewService,
    ServicePriceChangeReadService,
    ServicePriceChangeStore,
    ServicePriceChangeWriter,
    ServicePriceChangesService,
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
    ServicePriceSheetService,
    ServicePriceExportService,
    ServicePriceImportService,
    PromotionExportService,
    PromotionPublicService,
  ],
  exports: [
    PricingFacade,
    PricingSnapshotService,
    PriceRulesService,
    PriceRulePreviewService,
    PromotionExportService,
    PromotionPublicService,
  ],
})
export class PricingModule {}
