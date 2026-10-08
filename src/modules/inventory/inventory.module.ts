import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ProductsModule } from '../products/products.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryComputeService } from './services/inventory-compute.service.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [LocationModule, ProductsModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryComputeService],
  exports: [InventoryService],
})
export class InventoryModule {}
