import {
  BillingActorRole,
  BillingPeriod,
  BillingPlanPricingMode,
  BillingPlanStatus,
  Prisma,
  SubscriptionEventType,
  SubscriptionPayment,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { vi } from 'vitest';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';

export const TZ = 'Europe/Minsk';

/** 00:00 of a day in Minsk (UTC+3). */
export const minsk = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00+03:00`));

export const BILLING_SETTINGS = {
  defaultCountryCode: 'BY',
  trialDays: 30,
  graceDays: 3,
  pendingRequestGraceDays: 3,
};

const price = (planId: string, period: BillingPeriod, amount: string) => ({
  id: `${planId}-${period}`,
  planId,
  countryCode: 'BY',
  currency: 'BYN',
  billingPeriod: period,
  amount: new Prisma.Decimal(amount),
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  createdById: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
});

const plan = (
  id: string,
  prices: ReturnType<typeof price>[],
): BillingPlanWithPrices => ({
  id,
  code: id,
  name: id.toUpperCase(),
  position: 1,
  status: BillingPlanStatus.ACTIVE,
  isPublic: true,
  pricingMode: BillingPlanPricingMode.STANDARD,
  staffLimit: null,
  locationLimit: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  updatedById: null,
  prices,
});

export const START = plan('start', [
  price('start', BillingPeriod.MONTH, '29.00'),
  price('start', BillingPeriod.YEAR, '290.00'),
]);
export const PRO = plan('pro', [
  price('pro', BillingPeriod.MONTH, '59.00'),
  price('pro', BillingPeriod.YEAR, '590.00'),
]);
export const NO_PRICES = plan('no-prices', []);

export const withoutPrices = ({
  prices: _prices,
  ...rest
}: BillingPlanWithPrices) => rest;

export function subscription(
  overrides: Partial<SubscriptionWithPlan> = {},
): SubscriptionWithPlan {
  return {
    id: 'sub-1',
    brandId: 'brand-1',
    countryCode: 'BY',
    timezone: TZ,
    planId: null,
    billingPeriod: null,
    billingAnchorDay: null,
    trialStartedAt: minsk('2026-11-01'),
    trialEndsAt: minsk('2026-12-01'),
    trialUserId: 'owner-1',
    paidUntil: null,
    accessEndsAt: minsk('2026-12-01'),
    graceExtendedUntil: null,
    graceExtendedFor: null,
    customStaffLimit: null,
    customLocationLimit: null,
    customCurrency: null,
    customMonthlyPrice: null,
    customYearlyPrice: null,
    suspendedAt: null,
    suspendReason: null,
    createdAt: minsk('2026-11-01'),
    updatedAt: minsk('2026-11-01'),
    plan: null,
    ...overrides,
  };
}

export function payment(
  overrides: Partial<SubscriptionPayment> = {},
): SubscriptionPayment {
  return {
    id: 'pay-1',
    number: 12,
    subscriptionId: 'sub-1',
    brandId: 'brand-1',
    planId: START.id,
    planName: START.name,
    billingPeriod: BillingPeriod.MONTH,
    countryCode: 'BY',
    currency: 'BYN',
    amount: new Prisma.Decimal('29.00'),
    provider: SubscriptionPaymentProvider.OFFLINE,
    status: SubscriptionPaymentStatus.PAID,
    method: null,
    externalId: null,
    providerData: null,
    reference: null,
    failureReason: null,
    ownerComment: null,
    expiresAt: null,
    paidAt: null,
    confirmedAt: null,
    periodStart: null,
    periodEnd: null,
    createdById: 'owner-1',
    createdByRole: BillingActorRole.OWNER,
    confirmedById: null,
    adminNote: null,
    createdAt: minsk('2026-11-20'),
    updatedAt: minsk('2026-11-20'),
    ...overrides,
  };
}

/** Prisma client mock with the subscription tables; used both as db and as tx. */
export function subscriptionClient() {
  return {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createManyAndReturn: vi.fn(),
      update: vi.fn(),
    },
    subscriptionEvent: { create: vi.fn(), createMany: vi.fn() },
    subscriptionNotice: { createMany: vi.fn(), count: vi.fn() },
  };
}

export type SubscriptionClientMock = ReturnType<typeof subscriptionClient>;

/** db whose $transaction runs the callback on tx; tx.subscription.update echoes the data. */
export function subscriptionClients(): {
  db: SubscriptionClientMock;
  tx: SubscriptionClientMock;
} {
  const db = subscriptionClient();
  const tx = subscriptionClient();
  db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
  tx.subscription.update.mockImplementation(async ({ data }) => ({
    ...subscription(),
    ...data,
  }));
  return { db, tx };
}

/** Events written through SubscriptionEventService.record on this client. */
export const recordedEvents = (client: SubscriptionClientMock) =>
  client.subscriptionEvent.create.mock.calls.map(
    ([{ data }]) =>
      data as {
        type: SubscriptionEventType;
        payload: Record<string, unknown>;
      },
  );
