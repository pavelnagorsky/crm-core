import { Module } from '@nestjs/common';
import { BookingDeletionPolicyService } from './services/booking-deletion-policy.service.js';

@Module({
  providers: [BookingDeletionPolicyService],
  exports: [BookingDeletionPolicyService],
})
export class BookingDeletionPolicyModule {}
