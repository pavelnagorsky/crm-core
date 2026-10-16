import { Module } from '@nestjs/common';
import { BookingDeletionPolicyService } from './booking-deletion-policy.service.js';

@Module({
  providers: [BookingDeletionPolicyService],
  exports: [BookingDeletionPolicyService],
})
export class BookingDeletionPolicyModule {}
