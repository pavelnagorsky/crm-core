import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { LocationModule } from '../location/location.module.js';
import { ProductsModule } from '../products/products.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryReportService } from './report/inventory-report.service.js';
import { InventoryComputeService } from './services/inventory-compute.service.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [LocationModule, ProductsModule, I18nModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryComputeService,
    InventoryReportService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
