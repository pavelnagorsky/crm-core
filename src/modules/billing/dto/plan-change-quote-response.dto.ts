import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { PlanChangeQuote } from '../interfaces/plan-change-quote.interface.js';
import { BillingLimitsDto } from './billing-limits.dto.js';
import { BillingPlanSummaryDto } from './billing-plan-summary.dto.js';
import { BillingUsageDto } from './billing-usage.dto.js';

/** Plan change: the paid remainder converted by daily prices (plan section 4.4). */
export class PlanChangeQuoteResponseDto {
  @ApiProperty({ type: () => BillingPlanSummaryDto })
  plan: BillingPlanSummaryDto;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  billingPeriod: BillingPeriod;

  @ApiProperty({ type: String, format: 'date-time' })
  paidUntilBefore: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  paidUntilAfter: Date;

  @ApiProperty({ type: () => BillingLimitsDto })
  limits: BillingLimitsDto;

  @ApiProperty({ type: () => BillingUsageDto })
  usage: BillingUsageDto;

  @ApiProperty({ description: 'Usage fits; otherwise the change is rejected' })
  fits: boolean;

  static fromEntity(quote: PlanChangeQuote): PlanChangeQuoteResponseDto {
    return Object.assign(new PlanChangeQuoteResponseDto(), {
      plan: BillingPlanSummaryDto.fromEntity(quote.plan),
      billingPeriod: quote.billingPeriod,
      paidUntilBefore: quote.paidUntilBefore,
      paidUntilAfter: quote.paidUntilAfter,
      limits: BillingLimitsDto.fromEntity(quote.limits),
      usage: BillingUsageDto.fromEntity(quote.usage),
      fits: quote.fits,
    });
  }
}
