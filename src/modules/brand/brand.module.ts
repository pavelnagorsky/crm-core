import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { AccessModule } from '../access/access.module.js';
import { BookingDeletionPolicyModule } from '../bookings/deletion-policy/booking-deletion-policy.module.js';
import { UserModule } from '../user/user.module.js';
import { BrandController } from './controllers/brand.controller.js';
import { BrandService } from './services/brand.service.js';

@Module({
  imports: [
    AppCacheModule,
    UserModule,
    BookingDeletionPolicyModule,
    AccessModule,
  ],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
