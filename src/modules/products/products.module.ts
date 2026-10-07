import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
