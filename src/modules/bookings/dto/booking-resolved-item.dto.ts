import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ResolvedBookingItem } from '../interfaces/resolved-booking-item.interface.js';

export class BookingResolvedItemDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

  @ApiPrice({
    description:
      'Catalog price; for a fixed-price bundle, its share of the bundle price',
  })
  basePrice: string;

  @ApiPrice({ description: 'Price for the assigned staff member' })
  staffPrice: string;

  @ApiPrice({ description: 'Price list price: staff price with surcharges' })
  listPrice: string;

  @ApiPrice({ description: 'Discount from the price list price' })
  discountTotal: string;

  @ApiPrice({ description: 'listPrice - discountTotal' })
  chargedPrice: string;

  static fromResult(item: ResolvedBookingItem): BookingResolvedItemDto {
    return {
      serviceId: item.serviceId,
      serviceTitle: item.serviceTitle,
      staffId: item.staffId,
      staffName: item.staffName,
      startAt: item.startAt,
      endAt: item.endAt,
      basePrice: MoneyUtils.format(item.basePrice),
      staffPrice: MoneyUtils.format(item.staffPrice),
      listPrice: MoneyUtils.format(item.listPrice),
      discountTotal: MoneyUtils.format(item.discountTotal),
      chargedPrice: MoneyUtils.format(item.chargedPrice),
    };
  }
}
