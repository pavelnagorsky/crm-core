import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../shared/cache/app-cache.module.js';
import { BookingDeletionPolicyModule } from '../bookings/deletion-policy/booking-deletion-policy.module.js';
import { BrandModule } from '../brand/brand.module.js';
import { LocationController } from './controllers/location.controller.js';
import { LocationService } from './services/location.service.js';

@Module({
  imports: [AppCacheModule, BrandModule, BookingDeletionPolicyModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
