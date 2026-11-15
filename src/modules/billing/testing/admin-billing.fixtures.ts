import {
  BillingPeriod,
  BillingPlan,
  BillingPlanPricingMode,
  BillingPlanStatus,
  BillingSettings,
  Prisma,
  SubscriptionPaymentProvider,
} from '@prisma/client';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';

/** Shared fixtures of the admin service specs (src/modules/billing/admin). */

export const NOW = new Date('2026-06-15T12:00:00Z');

export const SETTINGS: BillingSettings = {
  id: 1,
  defaultCountryCode: 'BY',
  trialDays: 30,
  graceDays: 3,
  reminderDaysBefore: [7, 3, 1],
  paymentProvider: SubscriptionPaymentProvider.OFFLINE,
  paymentRequestTtlDays: 14,
  pendingRequestGraceDays: 3,
  offlinePaymentInstructions: null,
  adminNotifyEmail: null,
  enforcementEnabled: true,
  updatedAt: NOW,
  updatedById: null,
};

/** The Solo plan (staff 2, location 1, 25 BYN a month in BY) with overrides. */
export function plan(
  overrides: Partial<BillingPlan> = {},
): BillingPlanWithPrices {
  return {
    id: 'plan-solo',
    code: 'solo',
    name: 'Solo',
    position: 1,
    status: BillingPlanStatus.ACTIVE,
    isPublic: true,
    pricingMode: BillingPlanPricingMode.STANDARD,
    staffLimit: 2,
    locationLimit: 1,
    createdAt: NOW,
    updatedAt: NOW,
    updatedById: null,
    prices: [
      {
        id: 'price-1',
        planId: overrides.id ?? 'plan-solo',
        countryCode: 'BY',
        currency: 'BYN',
        billingPeriod: BillingPeriod.MONTH,
        amount: new Prisma.Decimal('25'),
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        createdById: null,
        createdAt: NOW,
      },
    ],
    ...overrides,
  };
}

export const SOLO = plan();

/** A paid Solo subscription of the brand, active until 2026-07-01. */
export function subscription(
  brandId: string,
  overrides: Partial<SubscriptionWithPlan> = {},
): SubscriptionWithPlan {
  return {
    id: `sub-${brandId}`,
    brandId,
    countryCode: 'BY',
    timezone: 'Europe/Minsk',
    planId: SOLO.id,
    billingPeriod: BillingPeriod.MONTH,
    billingAnchorDay: 1,
    trialStartedAt: new Date('2026-04-01T00:00:00Z'),
    trialEndsAt: new Date('2026-05-01T00:00:00Z'),
    trialUserId: null,
    paidUntil: new Date('2026-07-01T00:00:00Z'),
    accessEndsAt: new Date('2026-07-01T00:00:00Z'),
    graceExtendedUntil: null,
    graceExtendedFor: null,
    customStaffLimit: null,
    customLocationLimit: null,
    customCurrency: null,
    customMonthlyPrice: null,
    customYearlyPrice: null,
    suspendedAt: null,
    suspendReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    plan: SOLO,
    ...overrides,
  };
}
