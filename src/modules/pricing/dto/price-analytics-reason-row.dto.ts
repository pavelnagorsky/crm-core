import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';
import { PriceAnalyticsReasonRow } from '../interfaces/price-analytics-reason-row.interface.js';
import { PriceAnalyticsRuleDto } from './price-analytics-rule.dto.js';

/** One row of the "Скидки" or "Наценки" table. */
export class PriceAnalyticsReasonRowDto {
  @ApiProperty({ enum: PriceChangeReason, enumName: 'PriceChangeReason' })
  reason: PriceChangeReason;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The rule name; for a rule deleted from the database its title in the price layers; null for CLIENT_DISCOUNT and CUSTOM_PRICE_*.',
  })
  name: string | null;

  @ApiProperty({
    type: () => PriceAnalyticsRuleDto,
    nullable: true,
    description:
      'PROMOTION and SURCHARGE only; null for other reasons and for a rule deleted from the database.',
  })
  rule: PriceAnalyticsRuleDto | null;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiProperty({ type: Number })
  salesCount: number;

  @ApiProperty({ type: Number })
  clientsCount: number;

  @ApiProperty({ type: Number })
  itemsCount: number;

  @ApiPrice({ description: 'Positive amount of the discount or the surcharge.' })
  amount: string;

  @ApiProperty({
    type: Number,
    example: 42.5,
    description: 'Share in its group (discounts or surcharges), 0-100, one decimal.',
  })
  sharePct: number;

  static fromRow(row: PriceAnalyticsReasonRow): PriceAnalyticsReasonRowDto {
    const dto = new PriceAnalyticsReasonRowDto();
    dto.reason = row.reason;
    dto.rule = row.rule ? PriceAnalyticsRuleDto.fromRule(row.rule) : null;
    dto.name = row.name;
    dto.bookingsCount = row.bookingsCount;
    dto.salesCount = row.salesCount;
    dto.clientsCount = row.clientsCount;
    dto.itemsCount = row.itemsCount;
    dto.amount = MoneyUtils.format(row.amount);
    dto.sharePct = row.sharePct;
    return dto;
  }
}
