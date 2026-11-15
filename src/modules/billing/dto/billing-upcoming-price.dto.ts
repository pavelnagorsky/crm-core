import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod, BillingPlanPrice } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** A scheduled price version: «с 1 марта — 35 BYN». */
export class BillingUpcomingPriceDto {
  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  billingPeriod: BillingPeriod;

  @ApiPrice()
  amount: string;

  @ApiProperty({ type: String, format: 'date-time' })
  effectiveFrom: Date;

  static fromEntity(price: BillingPlanPrice): BillingUpcomingPriceDto {
    return Object.assign(new BillingUpcomingPriceDto(), {
      billingPeriod: price.billingPeriod,
      amount: MoneyUtils.format(price.amount),
      effectiveFrom: price.effectiveFrom,
    });
  }
}
