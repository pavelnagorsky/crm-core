import { ApiProperty } from '@nestjs/swagger';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import { BookingItemDiscountChoice } from '../interfaces/booking-item-discount-choice.interface.js';

/** The discount an administrator picked for the item (docs/pricing-stage5-api.md). */
export class BookingItemDiscountChoiceResponseDto {
  @ApiProperty({
    enum: DiscountChoiceMode,
    enumName: 'DiscountChoiceMode',
    description: 'Never AUTO: an item without a pick has discountChoice null',
  })
  mode: DiscountChoiceMode;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The promotion of mode RULE',
  })
  ruleId: string | null;

  /** Null for AUTO (nothing picked). */
  static fromItem(
    item: Partial<BookingItemDiscountChoice>,
  ): BookingItemDiscountChoiceResponseDto | null {
    if (!item.discountChoice) return null;
    return {
      mode: item.discountChoice as DiscountChoiceMode,
      ruleId: item.discountChoiceRuleId ?? null,
    };
  }
}
