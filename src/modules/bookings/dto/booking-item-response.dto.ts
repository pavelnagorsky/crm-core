import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingItemWithAdjustments } from '../interfaces/booking-item-with-adjustments.interface.js';
import { itemDiscount } from '../rules/booking-item-discount.rules.js';
import { BookingItemAdjustmentResponseDto } from './booking-item-adjustment-response.dto.js';
import { BookingItemDiscountChoiceResponseDto } from './booking-item-discount-choice-response.dto.js';

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

  @ApiProperty({
    type: () => BookingItemAdjustmentResponseDto,
    isArray: true,
    description:
      'Price layers from basePrice to chargedPrice: level or personal price, surcharges, rounding, discount',
  })
  adjustments: BookingItemAdjustmentResponseDto[];

  @ApiProperty({
    type: () => BookingItemAdjustmentResponseDto,
    nullable: true,
    description: 'The PROMOTION or CLIENT_DISCOUNT layer of adjustments; null without a discount',
  })
  discount: BookingItemAdjustmentResponseDto | null;

  @ApiProperty({
    type: () => BookingItemDiscountChoiceResponseDto,
    nullable: true,
    description:
      'The discount picked in the booking dialog, kept when the booking is priced again; null = AUTO (the best one). A picked promotion that no longer applies at a new time is reset to null on repricing',
  })
  discountChoice: BookingItemDiscountChoiceResponseDto | null;

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

  static fromEntity(item: BookingItemWithAdjustments): BookingItemResponseDto {
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
    dto.adjustments = (item.priceAdjustments ?? []).map((adjustment) =>
      BookingItemAdjustmentResponseDto.fromEntity(adjustment),
    );
    const discount = itemDiscount(item.priceAdjustments);
    dto.discount =
      discount === null
        ? null
        : BookingItemAdjustmentResponseDto.fromEntity(discount);
    dto.discountChoice = BookingItemDiscountChoiceResponseDto.fromItem(item);
    dto.staffId = item.staffId;
    dto.staffName = item.staffName;
    dto.startAt = item.startAt;
    dto.endAt = item.endAt;
    dto.calendarEventId = item.calendarEventId;
    return dto;
  }
}
