import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleKind } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceRuleStats } from '../interfaces/price-rule-stats.interface.js';

export class PriceRuleStatsResponseDto {
  @ApiPrice({
    description:
      'Surcharge added, or discount given (positive) by a promotion, to visits of the last 30 days, cancelled bookings excluded.',
  })
  amount: string;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiPrice({
    nullable: true,
    description:
      'Promotions: what the items with the promotion cost the clients; null for surcharges.',
  })
  revenue: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Promotions: clients for whom such a booking was the first in the brand; null for surcharges.',
  })
  newClients: number | null;

  static fromStats(
    kind: PriceRuleKind,
    stats: PriceRuleStats | undefined,
  ): PriceRuleStatsResponseDto {
    const promotion = kind === PriceRuleKind.PROMOTION;
    const dto = new PriceRuleStatsResponseDto();
    dto.amount = MoneyUtils.format(stats?.amount ?? 0);
    dto.bookingsCount = stats?.bookingsCount ?? 0;
    dto.revenue = promotion ? MoneyUtils.format(stats?.revenue ?? 0) : null;
    dto.newClients = promotion ? (stats?.newClients ?? 0) : null;
    return dto;
  }
}
