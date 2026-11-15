import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentQuote } from '../interfaces/payment-quote.interface.js';
import { BillingLimitsDto } from './billing-limits.dto.js';
import { BillingPlanSummaryDto } from './billing-plan-summary.dto.js';
import { BillingUsageDto } from './billing-usage.dto.js';

/** What a payment made today buys (plan sections 4.2, 4.3). */
export class PaymentQuoteResponseDto {
  @ApiProperty({ type: () => BillingPlanSummaryDto })
  plan: BillingPlanSummaryDto;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  billingPeriod: BillingPeriod;

  @ApiProperty({ example: 'BY', description: 'Country of the price' })
  countryCode: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiPrice()
  amount: string;

  @ApiProperty({ type: String, format: 'date-time' })
  periodStart: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Exclusive' })
  periodEnd: Date;

  @ApiProperty({
    type: () => BillingLimitsDto,
    description: 'Limits of the chosen plan',
  })
  limits: BillingLimitsDto;

  @ApiProperty({ type: () => BillingUsageDto })
  usage: BillingUsageDto;

  @ApiProperty({ description: 'Usage fits the limits of the chosen plan' })
  fits: boolean;

  @ApiProperty({
    description:
      'A request will be accepted: the usage fits, or the brand is blocked',
  })
  allowed: boolean;

  static fromEntity(quote: PaymentQuote): PaymentQuoteResponseDto {
    return Object.assign(new PaymentQuoteResponseDto(), {
      plan: BillingPlanSummaryDto.fromEntity(quote.plan),
      billingPeriod: quote.billingPeriod,
      countryCode: quote.price.countryCode,
      currency: quote.price.currency,
      amount: MoneyUtils.format(quote.price.amount),
      periodStart: quote.periodStart,
      periodEnd: quote.periodEnd,
      limits: BillingLimitsDto.fromEntity(quote.limits),
      usage: BillingUsageDto.fromEntity(quote.usage),
      fits: quote.fits,
      allowed: quote.allowed,
    });
  }
}
