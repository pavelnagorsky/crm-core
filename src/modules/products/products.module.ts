import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ProductPackagingService } from './services/product-packaging.service.js';
import { ProductPackagingController } from './product-packaging.controller.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ProductsController, ProductPackagingController],
  providers: [ProductsService, ProductPackagingService],
  exports: [ProductsService, ProductPackagingService],
})
export class ProductsModule {}
