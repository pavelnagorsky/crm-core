import { ApiProperty } from '@nestjs/swagger';
import {
  BookingItemPriceAdjustment,
  PriceAdjustmentKind,
  PriceValueType,
} from '@prisma/client';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** One price layer of a booking item, fixed at creation (docs/pricing-plan.md 2.1). */
export class BookingItemAdjustmentResponseDto {
  @ApiProperty({ enum: PriceAdjustmentKind, enumName: 'PriceAdjustmentKind' })
  kind: PriceAdjustmentKind;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Price rule (surcharge or promotion) that made the layer',
  })
  ruleId: string | null;

  @ApiProperty({ type: String, description: 'Internal title' })
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Title the client sees; null when the layer is not shown to clients (promotion not shown as one, surcharges)',
  })
  publicTitle: string | null;

  @ApiProperty({
    enum: PriceValueType,
    enumName: 'PriceValueType',
    nullable: true,
  })
  valueType: PriceValueType | null;

  @ApiSignedAmount({
    nullable: true,
    description: 'Percent or amount of the rule by valueType.',
  })
  value: string | null;

  @ApiSignedAmount({ description: 'Signed change of the item price.' })
  amount: string;

  static fromEntity(
    adjustment: BookingItemPriceAdjustment,
  ): BookingItemAdjustmentResponseDto {
    const dto = new BookingItemAdjustmentResponseDto();
    dto.kind = adjustment.kind;
    dto.ruleId = adjustment.ruleId;
    dto.title = adjustment.title;
    dto.publicTitle = adjustment.publicTitle;
    dto.valueType = adjustment.valueType;
    dto.value =
      adjustment.value === null ? null : MoneyUtils.format(adjustment.value);
    dto.amount = MoneyUtils.format(adjustment.amount);
    return dto;
  }
}
