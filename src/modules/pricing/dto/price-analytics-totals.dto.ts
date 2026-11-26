import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceAnalyticsTotals } from '../interfaces/price-analytics-totals.interface.js';

/** regular + surcharges - discounts = received over the items of the period or filter. */
export class PriceAnalyticsTotalsDto {
  @ApiPrice({
    description:
      'Regular prices: staff price of services (base, level, personal price), list line total of products.',
  })
  regular: string;

  @ApiPrice({ description: 'Surcharges and custom prices above the price list.' })
  surcharges: string;

  @ApiPrice({
    description: 'Promotions, client discounts and custom prices below the price list.',
  })
  discounts: string;

  @ApiPrice({ description: 'What the items cost, net of product returns.' })
  received: string;

  @ApiPrice({
    description: 'regular + surcharges, the price-list total; discount share = discounts / listTotal.',
  })
  listTotal: string;

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

  static fromTotals(totals: PriceAnalyticsTotals): PriceAnalyticsTotalsDto {
    const dto = new PriceAnalyticsTotalsDto();
    dto.regular = MoneyUtils.format(totals.regular);
    dto.surcharges = MoneyUtils.format(totals.surcharges);
    dto.discounts = MoneyUtils.format(totals.discounts);
    dto.received = MoneyUtils.format(totals.received);
    dto.listTotal = MoneyUtils.format(totals.listTotal);
    dto.itemsCount = totals.itemsCount;
    dto.bookingsCount = totals.bookingsCount;
    dto.salesCount = totals.salesCount;
    dto.clientsCount = totals.clientsCount;
    return dto;
  }
}
