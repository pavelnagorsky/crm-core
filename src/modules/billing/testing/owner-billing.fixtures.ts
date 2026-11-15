import {
  BillingActorRole,
  BillingPeriod,
  BillingPlan,
  BillingPlanPrice,
  BillingPlanPricingMode,
  BillingPlanStatus,
  BillingSettings,
  Prisma,
  SubscriptionPayment,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { expect } from 'vitest';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';

/** Fixtures of the owner billing specs: Solo/Team/Custom plans in BY and KZ. */
export const NOW = new Date('2026-06-15T12:00:00Z');
export const TX = { tx: true };

export function billingSettings(
  overrides: Partial<BillingSettings> = {},
): BillingSettings {
  return {
    id: 1,
    defaultCountryCode: 'BY',
    trialDays: 30,
    graceDays: 3,
    reminderDaysBefore: [7, 3, 1],
    paymentProvider: SubscriptionPaymentProvider.OFFLINE,
    paymentRequestTtlDays: 14,
    pendingRequestGraceDays: 3,
    offlinePaymentInstructions: 'Pay by ERIP',
    adminNotifyEmail: null,
    launchedAt: new Date('2026-01-01T00:00:00Z'),
    enforcementEnabled: true,
    updatedAt: NOW,
    updatedById: null,
    ...overrides,
  };
}

function price(
  planId: string,
  countryCode: string,
  amount: string,
  effectiveFrom: string,
  currency = 'BYN',
): BillingPlanPrice {
  return {
    id: `${planId}-${countryCode}-${effectiveFrom}`,
    planId,
    countryCode,
    currency,
    billingPeriod: BillingPeriod.MONTH,
    amount: new Prisma.Decimal(amount),
    effectiveFrom: new Date(effectiveFrom),
    createdById: null,
    createdAt: NOW,
  };
}

function plan(
  overrides: Partial<BillingPlan> = {},
  prices: BillingPlanPrice[] = [],
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
    ...overrides,
    prices,
  };
}

export const SOLO = plan({}, [
  price('plan-solo', 'BY', '20', '2026-01-01T00:00:00Z'),
  price('plan-solo', 'BY', '25', '2026-06-01T00:00:00Z'),
  price('plan-solo', 'BY', '30', '2026-08-01T00:00:00Z'),
  price('plan-solo', 'KZ', '5000', '2026-01-01T00:00:00Z', 'KZT'),
]);
export const TEAM = plan(
  {
    id: 'plan-team',
    code: 'team',
    name: 'Team',
    position: 2,
    staffLimit: 10,
    locationLimit: 3,
  },
  [price('plan-team', 'BY', '60', '2026-01-01T00:00:00Z')],
);
export const CUSTOM = plan({
  id: 'plan-custom',
  code: 'custom',
  name: 'Custom',
  position: 9,
  isPublic: false,
  pricingMode: BillingPlanPricingMode.CUSTOM,
  staffLimit: null,
  locationLimit: null,
});
export const PLANS = [SOLO, TEAM, CUSTOM];

/** ACTIVE on Solo: the trial ended in May, paid until July. */
export function subscription(
  overrides: Partial<SubscriptionWithPlan> = {},
): SubscriptionWithPlan {
  return {
    id: 'sub-1',
    brandId: 'brand-1',
    countryCode: 'BY',
    timezone: 'Europe/Minsk',
    planId: SOLO.id,
    billingPeriod: BillingPeriod.MONTH,
    billingAnchorDay: 1,
    trialStartedAt: new Date('2026-04-01T00:00:00Z'),
    trialEndsAt: new Date('2026-05-01T00:00:00Z'),
    trialUserId: 'user-1',
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

/** Paid period and grace are over at NOW. */
export const EXPIRED = {
  paidUntil: new Date('2026-05-01T00:00:00Z'),
  accessEndsAt: new Date('2026-05-01T00:00:00Z'),
};

export function payment(
  overrides: Partial<SubscriptionPayment> = {},
): SubscriptionPayment {
  return {
    id: 'pay-1',
    number: 123,
    subscriptionId: 'sub-1',
    brandId: 'brand-1',
    planId: SOLO.id,
    planName: 'Solo',
    billingPeriod: BillingPeriod.MONTH,
    countryCode: 'BY',
    currency: 'BYN',
    amount: new Prisma.Decimal('25'),
    provider: SubscriptionPaymentProvider.OFFLINE,
    status: SubscriptionPaymentStatus.PENDING,
    method: null,
    externalId: null,
    providerData: null,
    reference: null,
    failureReason: null,
    ownerComment: null,
    expiresAt: new Date('2026-06-29T00:00:00Z'),
    paidAt: null,
    confirmedAt: null,
    periodStart: null,
    periodEnd: null,
    createdById: 'user-1',
    createdByRole: BillingActorRole.OWNER,
    confirmedById: null,
    adminNote: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** The AppException a promise rejects with. */
export async function rejection(
  promise: Promise<unknown>,
): Promise<AppException> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}
