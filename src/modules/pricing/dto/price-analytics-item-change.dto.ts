import { ApiProperty } from '@nestjs/swagger';
import { PriceValueType } from '@prisma/client';
import {
  ApiDecimal,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsChange } from '../interfaces/price-analytics-change.interface.js';
import { isDiscount } from '../rules/price-analytics-item.rules.js';

/** What changed the price of an item, in the order of application. */
export class PriceAnalyticsItemChangeDto {
  @ApiProperty({ enum: PriceChangeReason, enumName: 'PriceChangeReason' })
  reason: PriceChangeReason;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'PROMOTION and SURCHARGE; null for other reasons and deleted rules.',
  })
  ruleId: string | null;

  @ApiProperty({
    type: String,
    description:
      'The current rule name (a deleted rule: its title at pricing time), "Скидка клиента", or "Своя цена".',
  })
  name: string;

  @ApiProperty({
    enum: PriceValueType,
    enumName: 'PriceValueType',
    nullable: true,
    description: 'From the rule or client discount layer; null for CUSTOM_*.',
  })
  valueType: PriceValueType | null;

  @ApiDecimal({
    nullable: true,
    description: 'Percent or amount the layer was priced with; null for CUSTOM_*.',
  })
  value: string | null;

  @ApiSignedAmount({ description: 'Surcharge positive, discount negative.' })
  amount: string;

  static fromChange(change: PriceAnalyticsChange): PriceAnalyticsItemChangeDto {
    const dto = new PriceAnalyticsItemChangeDto();
    dto.reason = change.reason;
    dto.ruleId = change.ruleId;
    dto.name = change.name;
    dto.valueType = change.valueType;
    dto.value = change.value === null ? null : MoneyUtils.format(change.value);
    dto.amount = MoneyUtils.format(
      isDiscount(change) ? change.amount.negated() : change.amount,
    );
    return dto;
  }
}
