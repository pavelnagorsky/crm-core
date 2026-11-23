import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, IsUUID, Matches, ValidateIf } from 'class-validator';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { CanonicalAmount } from '../../../shared/transforms/canonical-amount.transform.js';
import { PRICE_ROUNDING_STEPS } from '../constants/price-rounding-steps.constants.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';

/** What a bulk fill does to which services; the preview and the apply share it. */
export class PriceLevelFillRequestDto {
  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description: 'Categories to fill; empty: every service.',
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryIds: string[];

  @ApiProperty({ enum: PriceLevelFillMode, enumName: 'PriceLevelFillMode' })
  @IsEnum(PriceLevelFillMode)
  mode: PriceLevelFillMode;

  @ApiSignedAmount({
    required: false,
    description:
      'Signed change of the base price: percent (-99.00 to 1000.00) for PERCENT, amount for AMOUNT. Ignored for BASE.',
  })
  @ValidateIf((dto: PriceLevelFillRequestDto) => dto.mode !== PriceLevelFillMode.BASE)
  @CanonicalAmount()
  @Matches(regularExpressions.signedAmount)
  value?: string;

  @ApiProperty({
    type: String,
    enum: PRICE_ROUNDING_STEPS,
    example: '1.00',
    description: 'Step the new prices round to (nearest); 0.01 means no rounding.',
  })
  @CanonicalAmount()
  @IsIn(PRICE_ROUNDING_STEPS)
  priceRoundingStep: string;
}
