import { ApiProperty } from '@nestjs/swagger';
import { PriceAdjustmentKind, PriceValueType } from '@prisma/client';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceAdjustment } from '../engine/interfaces/price-adjustment.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

export class PriceExplainAdjustmentDto {
  @ApiProperty({ enum: PriceAdjustmentKind, enumName: 'PriceAdjustmentKind' })
  kind: PriceAdjustmentKind;

  @ApiProperty({ type: String, nullable: true })
  ruleId: string | null;

  @ApiProperty({ type: String })
  title: string;

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

  @ApiSignedAmount({ description: 'Signed change of the price.' })
  amount: string;

  static fromAdjustment(
    adjustment: PriceAdjustment,
  ): PriceExplainAdjustmentDto {
    const dto = new PriceExplainAdjustmentDto();
    dto.kind = adjustment.kind as string as PriceAdjustmentKind;
    dto.ruleId = adjustment.ruleId;
    dto.title = adjustment.title;
    dto.valueType = adjustment.valueType as string | null as PriceValueType | null;
    dto.value = adjustment.value === null ? null : minorToApi(adjustment.value);
    dto.amount = minorToApi(adjustment.amount);
    return dto;
  }
}
