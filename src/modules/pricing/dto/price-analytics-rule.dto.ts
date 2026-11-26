import { ApiProperty } from '@nestjs/swagger';
import {
  PriceRuleKind,
  PriceValueType,
  PromotionScenario,
} from '@prisma/client';
import { ApiDecimal } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceAnalyticsRuleInfo } from '../interfaces/price-analytics-rule-info.interface.js';

/** The current state of the rule of a summary row. */
export class PriceAnalyticsRuleDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String })
  name: string;

  @ApiProperty({ enum: PriceRuleKind, enumName: 'PriceRuleKind' })
  kind: PriceRuleKind;

  @ApiProperty({
    enum: PromotionScenario,
    enumName: 'PromotionScenario',
    nullable: true,
    description: 'Promotions only.',
  })
  scenario: PromotionScenario | null;

  @ApiProperty({ enum: PriceValueType, enumName: 'PriceValueType' })
  valueType: PriceValueType;

  @ApiDecimal({ description: 'Percent or amount by valueType.' })
  value: string;

  @ApiProperty({ type: String, nullable: true })
  promoCode: string | null;

  @ApiProperty({ type: Boolean })
  archived: boolean;

  static fromRule(rule: PriceAnalyticsRuleInfo): PriceAnalyticsRuleDto {
    const dto = new PriceAnalyticsRuleDto();
    dto.id = rule.id;
    dto.name = rule.name;
    dto.kind = rule.kind;
    dto.scenario = rule.scenario;
    dto.valueType = rule.valueType;
    dto.value = MoneyUtils.format(rule.value);
    dto.promoCode = rule.promoCode;
    dto.archived = rule.archived;
    return dto;
  }
}
