import { ApiProperty } from '@nestjs/swagger';
import { BookingPromotionLabel } from '../interfaces/booking-promotion-label.interface.js';

/** Promotion label of a service or bundle on the booking page. */
export class BookingPromotionLabelDto {
  @ApiProperty({
    type: String,
    example: 'Скидки до 20%',
    description:
      'The public name of the only promotion, or "Скидки до N%" for several (N: the biggest percent; an amount as its percent of priceFrom, rounded down).',
  })
  label: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    description: 'Promotions of setup.promotions that reach the item.',
  })
  promotionIds: string[];

  static fromLabel(
    label: BookingPromotionLabel | null | undefined,
  ): BookingPromotionLabelDto | null {
    if (!label) return null;
    return Object.assign(new BookingPromotionLabelDto(), label);
  }
}
