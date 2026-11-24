import { ApiProperty } from '@nestjs/swagger';
import { PriceValueType } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PromotionOverlap } from '../interfaces/promotion-overlap.interface.js';

export class PromotionOverlapDto {
  @ApiProperty({ type: String })
  ruleId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  publicName: string | null;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  valueType: PriceValueType;

  @ApiPrice({ description: 'Percent or amount by valueType.' })
  value: string;

  @ApiProperty({
    type: String,
    example: 'Маникюр, пн 10:00',
    description:
      'Where both promotions apply: the first common service («Все услуги» when both reach every service), then the weekday when either keeps to weekdays and the start time when either keeps to hours: «Маникюр», «Маникюр, пт», «Маникюр, пн 10:00».',
  })
  example: string;

  static fromOverlap(overlap: PromotionOverlap): PromotionOverlapDto {
    const dto = new PromotionOverlapDto();
    dto.ruleId = overlap.ruleId;
    dto.name = overlap.name;
    dto.publicName = overlap.publicName;
    dto.valueType = overlap.valueType;
    dto.value = MoneyUtils.format(overlap.value);
    dto.example = overlap.example;
    return dto;
  }
}
