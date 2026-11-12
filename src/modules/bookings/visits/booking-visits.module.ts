import { Module } from '@nestjs/common';
import { BookingVisitsService } from './services/booking-visits.service.js';

/** Read-only visit snapshots for modules that BookingsModule itself depends on. */
@Module({
  providers: [BookingVisitsService],
  exports: [BookingVisitsService],
})
export class BookingVisitsModule {}
