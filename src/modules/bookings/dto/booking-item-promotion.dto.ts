import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';

/**
 * Discount of a line picked in the booking dialog (docs/pricing-stage4-api.md). AUTO is the
 * best one; NONE, RULE and CLIENT_DISCOUNT need sale.price.override:write.
 */
export class BookingItemPromotionDto {
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
  @ValidateIf((dto: BookingItemPromotionDto) => dto.mode === DiscountChoiceMode.RULE)
  @IsUUID()
  ruleId?: string | null;
}
