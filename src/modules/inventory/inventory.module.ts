import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { LocationModule } from '../location/location.module.js';
import { ProductsModule } from '../products/products.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryReportService } from './report/inventory-report.service.js';
import { InventoryBalanceLockService } from './services/inventory-balance-lock.service.js';
import { InventoryExportService } from './services/inventory-export.service.js';
import { InventoryComputeService } from './services/inventory-compute.service.js';
import { InventorySaleReversalService } from './services/inventory-sale-reversal.service.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [LocationModule, ProductsModule, I18nModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryBalanceLockService,
    InventoryComputeService,
    InventorySaleReversalService,
    InventoryReportService,
    InventoryExportService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
