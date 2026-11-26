import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';
import { DiscountChoiceMode } from '../engine/enums/discount-choice-mode.enum.js';

/**
 * Discount of a line picked by an administrator: a booking item or a product line (docs/pricing-stage4-api.md, pricing-stage7-api.md). AUTO is the
 * best one; NONE, RULE and CLIENT_DISCOUNT need sale.price.override:write.
 */
export class PromotionChoiceDto {
  @ApiProperty({ enum: DiscountChoiceMode, enumName: 'DiscountChoiceMode' })
  @IsEnum(DiscountChoiceMode)
  mode: DiscountChoiceMode;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description: 'Promotion for mode RULE',
  })
  @ValidateIf((dto: PromotionChoiceDto) => dto.mode === DiscountChoiceMode.RULE)
  @IsUUID()
  ruleId?: string | null;
}
