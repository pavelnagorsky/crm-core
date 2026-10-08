import { Module } from '@nestjs/common';
import { BookingsAggregatesService } from './bookings-aggregates.service.js';

@Module({
  providers: [BookingsAggregatesService],
  exports: [BookingsAggregatesService],
})
export class BookingsAggregatesModule {}
