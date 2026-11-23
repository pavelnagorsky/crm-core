import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { LocationModule } from '../location/location.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { PriceLevelsController } from './controllers/price-levels.controller.js';
import { ServicePricesController } from './controllers/service-prices.controller.js';
import { PricingFacade } from './pricing.facade.js';
import { PriceLevelReadService } from './services/price-level-read.service.js';
import { PriceLevelsService } from './services/price-levels.service.js';
import { PricingSnapshotService } from './services/pricing-snapshot.service.js';
import { ServicePricesService } from './services/service-prices.service.js';

/** Prices and promotions (docs/pricing-plan.md). Depends on no booking or order module. */
@Module({
  imports: [AppCacheModule, LocationModule, ServiceCatalogModule, StaffModule],
  controllers: [PriceLevelsController, ServicePricesController],
  providers: [
    PricingFacade,
    PricingSnapshotService,
    PriceLevelReadService,
    PriceLevelsService,
    ServicePricesService,
  ],
  exports: [PricingFacade],
})
export class PricingModule {}
