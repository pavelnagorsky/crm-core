import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { SubscriptionState } from '../enums/subscription-state.enum.js';
import { BrandSubscriptionDetails } from '../interfaces/brand-subscription-details.interface.js';
import { BillingLimitsDto } from './billing-limits.dto.js';
import { BillingPlanSummaryDto } from './billing-plan-summary.dto.js';
import { BillingUsageDto } from './billing-usage.dto.js';
import { SubscriptionCustomPricesDto } from './subscription-custom-prices.dto.js';
import { SubscriptionPaymentDto } from './subscription-payment.dto.js';

/** GET /brands/:brandId/subscription (plan section 8.2). */
export class BrandSubscriptionResponseDto {
  @ApiProperty({ enum: SubscriptionState, enumName: 'SubscriptionState' })
  state: SubscriptionState;

  @ApiProperty({
    description:
      'Work is blocked (EXPIRED or SUSPENDED while enforcement is on)',
  })
  isBlocked: boolean;

  @ApiProperty({ type: () => BillingPlanSummaryDto, nullable: true })
  plan: BillingPlanSummaryDto | null;

  @ApiProperty({
    enum: BillingPeriod,
    enumName: 'BillingPeriod',
    nullable: true,
  })
  billingPeriod: BillingPeriod | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'BY',
    description: 'null in FREE',
  })
  countryCode: string | null;

  @ApiProperty({ example: 'BY', description: 'Country whose prices apply' })
  pricingCountry: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  trialEndsAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidUntil: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Access ends at this moment (exclusive)',
  })
  accessEndsAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-12-13',
    description:
      'Last day with access, inclusive, in the brand timezone. Show this to users',
  })
  lastAccessDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  daysLeft: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'SUSPENDED: reason entered by the platform',
  })
  suspendReason: string | null;

  @ApiProperty({
    type: () => BillingLimitsDto,
    description: 'Limits that apply now',
  })
  limits: BillingLimitsDto;

  @ApiProperty({ type: () => BillingUsageDto })
  usage: BillingUsageDto;

  @ApiProperty()
  overLimit: boolean;

  @ApiProperty({
    description: 'No standard plan fits; show «Обсудить условия»',
  })
  needsCustomPlan: boolean;

  @ApiProperty({ type: () => SubscriptionPaymentDto, nullable: true })
  pendingPayment: SubscriptionPaymentDto | null;

  @ApiProperty({ type: () => SubscriptionCustomPricesDto, nullable: true })
  customPrices: SubscriptionCustomPricesDto | null;

  @ApiProperty({
    description: 'Paid features are enforced (blocking and limits)',
  })
  enforcementEnabled: boolean;

  static fromEntity(
    details: BrandSubscriptionDetails,
  ): BrandSubscriptionResponseDto {
    const { subscription, pendingPayment } = details.snapshot;
    const view = details.view;
    return Object.assign(new BrandSubscriptionResponseDto(), {
      state: view.state,
      isBlocked: view.isBlocked,
      plan: subscription?.plan
        ? BillingPlanSummaryDto.fromEntity(subscription.plan)
        : null,
      billingPeriod: subscription?.billingPeriod ?? null,
      countryCode: subscription?.countryCode ?? null,
      pricingCountry: details.pricingCountry,
      currency: details.currency,
      trialEndsAt: view.trialEndsAt,
      paidUntil: view.paidUntil,
      accessEndsAt: view.accessEndsAt,
      lastAccessDate: view.lastAccessDate,
      graceEndsAt: view.graceEndsAt,
      daysLeft: view.daysLeft,
      suspendReason: subscription?.suspendedAt
        ? subscription.suspendReason
        : null,
      limits: BillingLimitsDto.fromEntity(details.limits),
      usage: BillingUsageDto.fromEntity(details.usage),
      overLimit: details.overLimit,
      needsCustomPlan: details.needsCustomPlan,
      pendingPayment: pendingPayment
        ? SubscriptionPaymentDto.fromEntity(pendingPayment)
        : null,
      customPrices: subscription
        ? SubscriptionCustomPricesDto.fromEntity(subscription, details.currency)
        : null,
      enforcementEnabled: details.settings.enforcementEnabled,
    });
  }
}
