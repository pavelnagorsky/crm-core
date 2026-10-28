import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { BrandModule } from '../brand/brand.module.js';
import { LocationModule } from '../location/location.module.js';
import { ProductsModule } from '../products/products.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { BookingCacheWarmupService } from './services/booking-cache-warmup.service.js';

@Module({
  imports: [
    AppCacheModule,
    BrandModule,
    LocationModule,
    ProductsModule,
    ServiceCatalogModule,
    StaffModule,
  ],
  providers: [BookingCacheWarmupService],
})
export class BookingCacheModule {}
