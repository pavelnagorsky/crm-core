import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { LocationModule } from '../location/location.module.js';
import { ProductsModule } from '../products/products.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';
import { InventoryDocumentItemCalculator } from './calculators/inventory-document-item.calculator.js';
import { InventoryValuationCalculator } from './calculators/inventory-valuation.calculator.js';
import { InventoryController } from './controllers/inventory.controller.js';
import { InventoryFacade } from './inventory.facade.js';
import { InventoryReportService } from './report/services/inventory-report.service.js';
import { InventoryBalanceLockService } from './services/inventory-balance-lock.service.js';
import { InventoryDocumentDraftService } from './services/inventory-document-draft.service.js';
import { InventoryDocumentMovementService } from './services/inventory-document-movement.service.js';
import { InventoryDocumentService } from './services/inventory-document.service.js';
import { InventoryExportService } from './export/services/inventory-export.service.js';
import { InventoryReadService } from './services/inventory-read.service.js';
import { InventorySaleReversalService } from './services/inventory-sale-reversal.service.js';
import { InventorySalesService } from './services/inventory-sales.service.js';
import { InventoryStockReadService } from './services/inventory-stock-read.service.js';

@Module({
  imports: [LocationModule, ProductsModule, SuppliersModule, I18nModule],
  controllers: [InventoryController],
  providers: [
    InventoryReadService,
    InventoryStockReadService,
    InventoryDocumentMovementService,
    InventorySalesService,
    InventoryDocumentService,
    InventoryFacade,
    InventoryDocumentDraftService,
    InventoryDocumentItemCalculator,
    InventoryBalanceLockService,
    InventoryValuationCalculator,
    InventorySaleReversalService,
    InventoryReportService,
    InventoryExportService,
  ],
  exports: [InventoryFacade],
})
export class InventoryModule {}
