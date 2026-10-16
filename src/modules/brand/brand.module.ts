import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module.js';
import { BookingDeletionPolicyModule } from '../bookings/deletion-policy/booking-deletion-policy.module.js';
import { BrandController } from './brand.controller.js';
import { BrandService } from './brand.service.js';

@Module({
  imports: [UserModule, BookingDeletionPolicyModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
