import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod, BillingPlanPrice } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BillingPriceCalculator } from '../compute/billing-price.calculator.js';

/** A current price of one period (plan section 7.1). */
export class BillingPeriodPriceDto {
  @ApiPrice({ description: 'Price of the whole period' })
  amount: string;

  @ApiPrice({ description: 'Price per month: amount / 12 for a year' })
  monthlyAmount: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 17,
    description: 'YEAR only: discount against 12 monthly payments',
  })
  discountPercent: number | null;

  static fromEntity(
    price: BillingPlanPrice,
    period: BillingPeriod,
    discountPercent: number | null,
  ): BillingPeriodPriceDto {
    return Object.assign(new BillingPeriodPriceDto(), {
      amount: MoneyUtils.format(price.amount),
      monthlyAmount: MoneyUtils.format(
        BillingPriceCalculator.monthlyAmount(price.amount, period),
      ),
      discountPercent,
    });
  }
}
