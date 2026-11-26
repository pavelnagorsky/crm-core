import { ApiProperty } from '@nestjs/swagger';
import { PriceRuleKind } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceRuleStats } from '../interfaces/price-rule-stats.interface.js';
import { PromotionProductStats } from '../interfaces/promotion-product-stats.interface.js';

export class PriceRuleStatsResponseDto {
  @ApiPrice({
    description:
      'Surcharge added, or discount given (positive) by a promotion, to visits of the last 30 days, cancelled bookings excluded; a promotion also on product lines confirmed in that time, net of returns.',
  })
  amount: string;

  @ApiProperty({ type: Number })
  bookingsCount: number;

  @ApiPrice({
    nullable: true,
    description:
      'Promotions: what the items and product lines (net of returns) with the promotion cost the clients; null for surcharges.',
  })
  revenue: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Promotions: separate sales with the promotion confirmed in the last 30 days; null for surcharges.',
  })
  salesCount: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Promotions: clients for whom such a booking was the first in the brand; null for surcharges.',
  })
  newClients: number | null;

  /** `products`: the product lines of a promotion (pricing reads the orders). */
  static fromStats(
    kind: PriceRuleKind,
    stats: PriceRuleStats | undefined,
    products?: PromotionProductStats,
  ): PriceRuleStatsResponseDto {
    const promotion = kind === PriceRuleKind.PROMOTION;
    const dto = new PriceRuleStatsResponseDto();
    const amount = MoneyUtils.decimal(stats?.amount ?? 0);
    const revenue = MoneyUtils.decimal(stats?.revenue ?? 0);
    dto.amount = MoneyUtils.format(
      promotion && products ? amount.plus(products.discount) : amount,
    );
    dto.bookingsCount = stats?.bookingsCount ?? 0;
    dto.revenue = promotion
      ? MoneyUtils.format(products ? revenue.plus(products.revenue) : revenue)
      : null;
    dto.salesCount = promotion ? (products?.salesCount ?? 0) : null;
    dto.newClients = promotion ? (stats?.newClients ?? 0) : null;
    return dto;
  }
}
