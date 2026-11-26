import { ApiProperty } from '@nestjs/swagger';
import { PriceAnalyticsCounts } from '../interfaces/price-analytics-counts.interface.js';

/** Distinct counts over all items of the period that have a discount (or a surcharge) reason. */
export class PriceAnalyticsCountsDto {
  @ApiProperty({ type: Number })
  itemsCount: number;

  @ApiProperty({
    type: Number,
    description: 'Distinct bookings of the items; visit products count to their booking.',
  })
  bookingsCount: number;

  @ApiProperty({ type: Number, description: 'Distinct separate sales (orders without a booking).' })
  salesCount: number;

  @ApiProperty({
    type: Number,
    description: 'Distinct clients of the bookings and sales; items without a client are not counted.',
  })
  clientsCount: number;

  static fromCounts(counts: PriceAnalyticsCounts): PriceAnalyticsCountsDto {
    const dto = new PriceAnalyticsCountsDto();
    dto.itemsCount = counts.itemsCount;
    dto.bookingsCount = counts.bookingsCount;
    dto.salesCount = counts.salesCount;
    dto.clientsCount = counts.clientsCount;
    return dto;
  }
}
