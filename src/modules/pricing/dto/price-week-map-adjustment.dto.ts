import { ApiProperty } from '@nestjs/swagger';
import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import { PriceWeekMapAdjustment } from '../interfaces/price-week-map-adjustment.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

export class PriceWeekMapAdjustmentDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null for the rounding.',
  })
  ruleId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiSignedAmount()
  amount: string;

  static fromAdjustment(
    adjustment: PriceWeekMapAdjustment,
  ): PriceWeekMapAdjustmentDto {
    const dto = new PriceWeekMapAdjustmentDto();
    dto.ruleId = adjustment.ruleId;
    dto.title = adjustment.title;
    dto.amount = minorToApi(adjustment.amount);
    return dto;
  }
}
