import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PRICE_ROUNDING_STEPS } from '../constants/price-rounding-steps.constants.js';

export class PricingSettingsResponseDto {
  @ApiProperty({ type: String, enum: PRICE_ROUNDING_STEPS, example: '1.00' })
  priceRoundingStep: string;

  static fromStep(step: Prisma.Decimal): PricingSettingsResponseDto {
    const dto = new PricingSettingsResponseDto();
    dto.priceRoundingStep = MoneyUtils.format(step);
    return dto;
  }
}
