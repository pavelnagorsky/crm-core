import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module.js';
import { BookingDeletionPolicyModule } from '../bookings/deletion-policy/booking-deletion-policy.module.js';
import { BrandController } from './brand.controller.js';
import { BrandService } from './brand.service.js';
import { AccessModule } from '../access/access.module.js';

@Module({
  imports: [UserModule, BookingDeletionPolicyModule, AccessModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
