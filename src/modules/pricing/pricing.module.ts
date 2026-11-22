import { Module } from '@nestjs/common';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { PricingFacade } from './pricing.facade.js';
import { PricingSnapshotService } from './services/pricing-snapshot.service.js';

/** Prices and promotions (docs/pricing-plan.md). Depends on no booking or order module. */
@Module({
  imports: [ServiceCatalogModule],
  providers: [PricingFacade, PricingSnapshotService],
  exports: [PricingFacade],
})
export class PricingModule {}
