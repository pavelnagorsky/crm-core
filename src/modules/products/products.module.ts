import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ProductPackagingController } from './controllers/product-packaging.controller.js';
import { ProductsController } from './controllers/products.controller.js';
import { ProductPackagingService } from './services/product-packaging.service.js';
import { ProductsService } from './services/products.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ProductsController, ProductPackagingController],
  providers: [ProductsService, ProductPackagingService],
  exports: [ProductsService, ProductPackagingService],
})
export class ProductsModule {}
