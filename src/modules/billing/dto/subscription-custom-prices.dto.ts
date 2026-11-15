import { Subscription } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** Individual prices of a CUSTOM plan for this brand. */
export class SubscriptionCustomPricesDto {
  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiPrice({ nullable: true })
  MONTH: string | null;

  @ApiPrice({ nullable: true })
  YEAR: string | null;

  /** null when the subscription has no custom prices. */
  static fromEntity(
    subscription: Subscription,
    fallbackCurrency: string,
  ): SubscriptionCustomPricesDto | null {
    if (!subscription.customMonthlyPrice && !subscription.customYearlyPrice)
      return null;
    return Object.assign(new SubscriptionCustomPricesDto(), {
      currency: subscription.customCurrency ?? fallbackCurrency,
      MONTH: subscription.customMonthlyPrice
        ? MoneyUtils.format(subscription.customMonthlyPrice)
        : null,
      YEAR: subscription.customYearlyPrice
        ? MoneyUtils.format(subscription.customYearlyPrice)
        : null,
    });
  }
}
