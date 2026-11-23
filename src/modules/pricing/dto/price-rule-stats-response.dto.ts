import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceRuleSurchargeStats } from '../interfaces/price-rule-surcharge-stats.interface.js';

export class PriceRuleStatsResponseDto {
  @ApiPrice({
    description:
      'Surcharge the rule added to visits of the last 30 days, cancelled bookings excluded.',
  })
  amount: string;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  static fromStats(
    stats: PriceRuleSurchargeStats | undefined,
  ): PriceRuleStatsResponseDto {
    const dto = new PriceRuleStatsResponseDto();
    dto.amount = MoneyUtils.format(stats?.amount ?? 0);
    dto.bookingsCount = stats?.bookingsCount ?? 0;
    return dto;
  }
}
