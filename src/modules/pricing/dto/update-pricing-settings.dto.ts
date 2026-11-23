import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { PRICE_ROUNDING_STEPS } from '../constants/price-rounding-steps.constants.js';

export class UpdatePricingSettingsDto {
  @ApiProperty({
    type: String,
    enum: PRICE_ROUNDING_STEPS,
    example: '1.00',
    description:
      'Step a surcharged price rounds to; 0.01 means no rounding. A shorter fraction is normalized (1 becomes 1.00).',
  })
  @CanonicalAmount()
  @IsIn(PRICE_ROUNDING_STEPS)
  priceRoundingStep: string;
}
