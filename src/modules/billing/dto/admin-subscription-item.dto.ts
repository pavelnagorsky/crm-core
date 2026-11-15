import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { SubscriptionState } from '../enums/subscription-state.enum.js';
import { AdminSubscriptionItem } from '../interfaces/admin-subscription-item.interface.js';
import { BillingLimitsDto } from './billing-limits.dto.js';
import { BillingPlanSummaryDto } from './billing-plan-summary.dto.js';
import { BillingUsageDto } from './billing-usage.dto.js';

export class AdminSubscriptionItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  brandId: string;

  @ApiProperty({ type: String, nullable: true })
  brandName: string | null;

  @ApiProperty({
    description: 'The brand is deleted; the subscription is kept for history',
  })
  brandDeleted: boolean;

  @ApiProperty({ type: [String] })
  ownerEmails: string[];

  @ApiProperty({ enum: SubscriptionState, enumName: 'SubscriptionState' })
  state: SubscriptionState;

  @ApiProperty()
  isBlocked: boolean;

  @ApiProperty({ type: () => BillingPlanSummaryDto, nullable: true })
  plan: BillingPlanSummaryDto | null;

  @ApiProperty({
    enum: BillingPeriod,
    enumName: 'BillingPeriod',
    nullable: true,
  })
  billingPeriod: BillingPeriod | null;

  @ApiProperty({ example: 'BY' })
  countryCode: string;

  @ApiProperty({ example: 'Europe/Minsk' })
  timezone: string;

  @ApiProperty({ type: String, format: 'date-time' })
  trialEndsAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidUntil: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  accessEndsAt: Date;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  lastAccessDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  graceEndsAt: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  daysLeft: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  suspendReason: string | null;

  @ApiProperty({ type: Number, nullable: true })
  customStaffLimit: number | null;

  @ApiProperty({ type: Number, nullable: true })
  customLocationLimit: number | null;

  @ApiProperty({ type: String, nullable: true })
  customCurrency: string | null;

  @ApiPrice({ nullable: true })
  customMonthlyPrice: string | null;

  @ApiPrice({ nullable: true })
  customYearlyPrice: string | null;

  @ApiProperty({
    type: () => BillingLimitsDto,
    description: 'Limits that apply now',
  })
  limits: BillingLimitsDto;

  @ApiProperty({ type: () => BillingUsageDto })
  usage: BillingUsageDto;

  @ApiProperty()
  overLimit: boolean;

  @ApiProperty()
  needsCustomPlan: boolean;

  @ApiProperty()
  hasPendingPayment: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromEntity(item: AdminSubscriptionItem): AdminSubscriptionItemDto {
    return AdminSubscriptionItemDto.fill(new AdminSubscriptionItemDto(), item);
  }

  protected static fill<T extends AdminSubscriptionItemDto>(
    dto: T,
    item: AdminSubscriptionItem,
  ): T {
    const { subscription: s, view } = item;
    return Object.assign(dto, {
      id: s.id,
      brandId: s.brandId,
      brandName: item.brandName,
      brandDeleted: item.brandDeleted,
      ownerEmails: item.ownerEmails,
      state: view.state,
      isBlocked: view.isBlocked,
      plan: s.plan ? BillingPlanSummaryDto.fromEntity(s.plan) : null,
      billingPeriod: s.billingPeriod,
      countryCode: s.countryCode,
      timezone: s.timezone,
      trialEndsAt: s.trialEndsAt,
      paidUntil: s.paidUntil,
      accessEndsAt: s.accessEndsAt,
      lastAccessDate: view.lastAccessDate,
      graceEndsAt: view.graceEndsAt,
      daysLeft: view.daysLeft,
      suspendedAt: s.suspendedAt,
      suspendReason: s.suspendReason,
      customStaffLimit: s.customStaffLimit,
      customLocationLimit: s.customLocationLimit,
      customCurrency: s.customCurrency,
      customMonthlyPrice: s.customMonthlyPrice
        ? MoneyUtils.format(s.customMonthlyPrice)
        : null,
      customYearlyPrice: s.customYearlyPrice
        ? MoneyUtils.format(s.customYearlyPrice)
        : null,
      limits: BillingLimitsDto.fromEntity(item.limits),
      usage: BillingUsageDto.fromEntity(item.usage),
      overLimit: item.overLimit,
      needsCustomPlan: item.needsCustomPlan,
      hasPendingPayment: item.hasPendingPayment,
      createdAt: s.createdAt,
    });
  }
}
