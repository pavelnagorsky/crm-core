import { ApiProperty } from '@nestjs/swagger';
import { BookingItem } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

export class BookingItemResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiProperty({ type: Number })
  serviceDuration: number;

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

  @ApiPrice({ nullable: true })
  customPrice: string | null;

  @ApiProperty({ type: String })
  staffId: string;

  @ApiProperty({ type: String })
  staffName: string;

  @ApiProperty({ type: Date })
  startAt: Date;

  @ApiProperty({ type: Date })
  endAt: Date;

  @ApiProperty({ type: String, nullable: true })
  calendarEventId: string | null;

  static fromEntity(item: BookingItem): BookingItemResponseDto {
    const dto = new BookingItemResponseDto();
    dto.id = item.id;
    dto.serviceId = item.serviceId;
    dto.serviceTitle = item.serviceTitle;
    dto.serviceDuration = item.serviceDuration;
    dto.basePrice = MoneyUtils.format(item.basePrice);
    dto.staffPrice = MoneyUtils.format(item.staffPrice);
    dto.listPrice = MoneyUtils.format(item.listPrice);
    dto.discountTotal = MoneyUtils.format(item.discountTotal);
    dto.chargedPrice = MoneyUtils.format(item.chargedPrice);
    dto.customPrice =
      item.customPrice == null ? null : MoneyUtils.format(item.customPrice);
    dto.staffId = item.staffId;
    dto.staffName = item.staffName;
    dto.startAt = item.startAt;
    dto.endAt = item.endAt;
    dto.calendarEventId = item.calendarEventId;
    return dto;
  }
}
