import { ApiProperty } from '@nestjs/swagger';
import { PriceScheduleType, PriceValueType } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceRulePreviewReplaced } from '../interfaces/price-rule-preview-replaced.interface.js';

export class PriceRulePreviewReplacedDto {
  @ApiProperty({ type: String })
  ruleId: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ enum: PriceScheduleType, enumName: 'PriceScheduleType' })
  scheduleType: PriceScheduleType;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  valueType: PriceValueType;

  @ApiPrice({ description: 'Percent or amount by valueType.' })
  value: string;

  static fromReplaced(
    replaced: PriceRulePreviewReplaced,
  ): PriceRulePreviewReplacedDto {
    const dto = new PriceRulePreviewReplacedDto();
    dto.ruleId = replaced.ruleId;
    dto.name = replaced.name;
    dto.scheduleType = replaced.scheduleType;
    dto.valueType = replaced.valueType;
    dto.value = MoneyUtils.format(replaced.value);
    return dto;
  }
}
