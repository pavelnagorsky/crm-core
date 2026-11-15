import { BillingPeriod, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** Pure price presentation rules of plan section 7.1. */
export class BillingPriceCalculator {
  private constructor() {}

  /** Price per month: the yearly amount / 12, half-up to 2 places. */
  static monthlyAmount(
    amount: Prisma.Decimal,
    period: BillingPeriod,
  ): Prisma.Decimal {
    return period === BillingPeriod.YEAR
      ? MoneyUtils.quantize(amount.div(12))
      : MoneyUtils.quantize(amount);
  }

  /** round((1 - YEAR / (MONTH * 12)) * 100); null without both prices. */
  static discountPercent(
    monthly: Prisma.Decimal | null,
    yearly: Prisma.Decimal | null,
  ): number | null {
    if (!monthly || !yearly || monthly.lte(0)) return null;
    return new Prisma.Decimal(1)
      .minus(yearly.div(monthly.mul(12)))
      .mul(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();
  }
}
