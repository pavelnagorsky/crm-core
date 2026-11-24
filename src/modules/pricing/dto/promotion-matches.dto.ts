import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionMatches } from '../interfaces/promotion-matches.interface.js';

export class PromotionMatchesDto {
  @ApiProperty({
    type: Number,
    description:
      'Live bookings of the last 30 days the promotion would have reached by service, staff, channel and visit time.',
  })
  bookingsCount: number;

  @ApiPrice({ description: 'Their discount by the price list.' })
  discount: string;

  static fromMatches(matches: PromotionMatches): PromotionMatchesDto {
    const dto = new PromotionMatchesDto();
    dto.bookingsCount = matches.bookingsCount;
    dto.discount = MoneyUtils.format(matches.discount);
    return dto;
  }
}
