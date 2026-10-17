import { Module } from '@nestjs/common';
import { LocationModule } from '../../location/location.module.js';
import { BookingsAggregatesService } from './services/bookings-aggregates.service.js';

@Module({
  imports: [LocationModule],
  providers: [BookingsAggregatesService],
  exports: [BookingsAggregatesService],
})
export class BookingsAggregatesModule {}
