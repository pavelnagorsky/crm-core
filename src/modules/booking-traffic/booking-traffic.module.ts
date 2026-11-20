import { Module } from '@nestjs/common';
import { BookingTrafficService } from './services/booking-traffic.service.js';

@Module({
  providers: [BookingTrafficService],
  exports: [BookingTrafficService],
})
export class BookingTrafficModule {}
