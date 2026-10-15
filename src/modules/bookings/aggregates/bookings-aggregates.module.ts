import { Module } from '@nestjs/common';
import { BookingsAggregatesService } from './bookings-aggregates.service.js';
import { LocationModule } from '../../location/location.module.js';

@Module({
  imports: [LocationModule],
  providers: [BookingsAggregatesService],
  exports: [BookingsAggregatesService],
})
export class BookingsAggregatesModule {}
