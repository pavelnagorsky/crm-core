import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { AccessModule } from '../access/access.module.js';
import { BillingCoreModule } from '../billing/billing-core.module.js';
import { BookingDeletionPolicyModule } from '../bookings/deletion-policy/booking-deletion-policy.module.js';
import { BrandService } from './services/brand.service.js';

@Module({
  imports: [
    AppCacheModule,
    BookingDeletionPolicyModule,
    AccessModule,
    BillingCoreModule,
  ],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
