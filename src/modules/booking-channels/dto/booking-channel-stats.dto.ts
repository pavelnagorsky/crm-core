import { ApiProperty } from '@nestjs/swagger';
import { BookingChannelStats } from '../interfaces/booking-channel-stats.interface.js';

export class BookingChannelStatsDto {
  @ApiProperty({ type: Number, minimum: 0, description: 'All-time views' })
  views: number;

  @ApiProperty({ type: Number, minimum: 0, description: 'All-time form opens' })
  formOpens: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description:
      'All-time created bookings, including cancelled and soft-deleted bookings',
  })
  bookings: number;

  constructor(stats?: BookingChannelStats) {
    this.views = stats?.views ?? 0;
    this.formOpens = stats?.formOpens ?? 0;
    this.bookings = stats?.bookings ?? 0;
  }
}
