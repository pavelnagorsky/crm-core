import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod, BillingPlanPrice } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** A price version (admin). */
export class BillingPlanPriceDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BY' })
  countryCode: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  billingPeriod: BillingPeriod;

  @ApiPrice()
  amount: string;

  @ApiProperty({ type: String, format: 'date-time' })
  effectiveFrom: Date;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdById: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromEntity(price: BillingPlanPrice): BillingPlanPriceDto {
    return Object.assign(new BillingPlanPriceDto(), {
      id: price.id,
      countryCode: price.countryCode,
      currency: price.currency,
      billingPeriod: price.billingPeriod,
      amount: MoneyUtils.format(price.amount),
      effectiveFrom: price.effectiveFrom,
      createdById: price.createdById,
      createdAt: price.createdAt,
    });
  }
}
