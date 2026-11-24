import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleSkipReason } from '../../pricing/engine/enums/price-rule-skip-reason.enum.js';
import { PromotionSkip } from '../../pricing/engine/interfaces/promotion-skip.interface.js';

/** A promotion on this service that does not apply to the line, and why. */
export class BookingPricingPromotionSkipDto {
  @ApiProperty({ type: String, format: 'uuid' })
  ruleId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ enum: PriceRuleSkipReason, enumName: 'PriceRuleSkipReason' })
  reason: PriceRuleSkipReason;

  static fromSkip(skip: PromotionSkip): BookingPricingPromotionSkipDto {
    return Object.assign(new BookingPricingPromotionSkipDto(), {
      ruleId: skip.ruleId,
      title: skip.title,
      reason: skip.reason,
    });
  }
}
