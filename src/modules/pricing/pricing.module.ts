import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LocationModule } from '../location/location.module.js';
import { ProductsModule } from '../products/products.module.js';
import { UserModule } from '../user/user.module.js';
import { ServiceWriteModule } from '../services/service-write/service-write.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { ProductPriceChangesController } from './controllers/product-price-changes.controller.js';
import { ProductPriceImportController } from './controllers/product-price-import.controller.js';
import { ServicePriceImportController } from './controllers/service-price-import.controller.js';
import { ServicePriceChangesController } from './controllers/service-price-changes.controller.js';
import { PriceChangeApplier } from './services/price-change-applier.service.js';
import { PriceChangeCron } from './services/price-change.cron.js';
import { PriceChangeHistoryService } from './services/price-change-history.service.js';
import { PriceChangeLifecycleService } from './services/price-change-lifecycle.service.js';
import { PriceChangeLock } from './services/price-change-lock.service.js';
import { ProductPriceChangePreviewService } from './services/product-price-change-preview.service.js';
import { ProductPriceChangeReadService } from './services/product-price-change-read.service.js';
import { ProductPriceChangesService } from './services/product-price-changes.service.js';
import { ProductPriceExportService } from './services/product-price-export.service.js';
import { ProductPriceImportService } from './services/product-price-import.service.js';
import { ProductPriceSheetService } from './services/product-price-sheet.service.js';
import { ServicePriceChangePreviewService } from './services/service-price-change-preview.service.js';
import { ServicePriceChangeReadService } from './services/service-price-change-read.service.js';
import { PriceChangeStore } from './services/price-change-store.service.js';
import { PriceChangeWriter } from './services/price-change-writer.service.js';
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
import { PricingContextService } from './services/pricing-context.service.js';
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
  imports: [
    AppCacheModule,
    ClientsModule,
    InventoryModule,
    LocationModule,
    ProductsModule,
    ServiceCatalogModule,
    ServiceWriteModule,
    StaffModule,
    UserModule,
  ],
  controllers: [
    PriceLevelsController,
    PriceLevelTablesController,
    PricingPreviewController,
    ServicePricesController,
    ServicePriceImportController,
    ServicePriceChangesController,
    ProductPriceChangesController,
    ProductPriceImportController,
    PricingSettingsController,
    PublicPromotionsController,
  ],
  providers: [
    PricingFacade,
    PricingContextService,
    PricingSnapshotService,
    ScheduledPriceChangeReadService,
    PriceChangeApplier,
    PriceChangeCron,
    PriceChangeHistoryService,
    PriceChangeLifecycleService,
    PriceChangeLock,
    ProductPriceChangePreviewService,
    ProductPriceChangeReadService,
    ProductPriceChangesService,
    ProductPriceExportService,
    ProductPriceImportService,
    ProductPriceSheetService,
    ServicePriceChangePreviewService,
    ServicePriceChangeReadService,
    PriceChangeStore,
    PriceChangeWriter,
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
    PricingContextService,
    PricingSnapshotService,
    PriceRulesService,
    PriceRulePreviewService,
    PromotionExportService,
    PromotionPublicService,
  ],
})
export class PricingModule {}
