import {
  BillingActorRole,
  BillingPeriod,
  BillingPlanPricingMode,
  BillingPlanStatus,
  Prisma,
  SubscriptionPayment,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { vi } from 'vitest';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';
import { ComplimentaryPaymentProvider } from '../payments/complimentary/complimentary-payment.provider.js';
import { OfflinePaymentProvider } from '../payments/offline/offline-payment.provider.js';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry.js';
import { PaymentApplicationService } from '../payments/services/payment-application.service.js';
import { PaymentRequestService } from '../payments/services/payment-request.service.js';
import { SubscriptionPaymentService } from '../payments/services/subscription-payment.service.js';

/** 00:00 of a day in Minsk (UTC+3). */
export const minsk = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00+03:00`));

export const PAYMENT_SETTINGS = {
  defaultCountryCode: 'BY',
  paymentProvider: SubscriptionPaymentProvider.OFFLINE,
  paymentRequestTtlDays: 14,
  offlinePaymentInstructions: 'IBAN BY00 0000',
};

/** What SubscriptionPeriodService.applyPayment returns by default. */
export const APPLIED_PERIOD = {
  periodStart: minsk('2026-12-01'),
  periodEnd: minsk('2027-01-01'),
  anchorDay: 1,
};

export const START: BillingPlanWithPrices = {
  id: 'start',
  code: 'start',
  name: 'Start',
  position: 1,
  status: BillingPlanStatus.ACTIVE,
  isPublic: true,
  pricingMode: BillingPlanPricingMode.STANDARD,
  staffLimit: 3,
  locationLimit: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  updatedById: null,
  prices: [
    {
      id: 'start-month',
      planId: 'start',
      countryCode: 'BY',
      currency: 'BYN',
      billingPeriod: BillingPeriod.MONTH,
      amount: new Prisma.Decimal('29.00'),
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      createdById: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ],
};
const { prices: _prices, ...startPlan } = START;
export const START_PLAN = startPlan;
export const PRO_PLAN = { ...START_PLAN, id: 'pro', code: 'pro', name: 'Pro' };

/** A paid START subscription, paid until 2026-12-01. */
export function paidSubscription(
  overrides: Partial<SubscriptionWithPlan> = {},
): SubscriptionWithPlan {
  return {
    id: 'sub-1',
    brandId: 'brand-1',
    countryCode: 'BY',
    timezone: 'Europe/Minsk',
    planId: START.id,
    billingPeriod: BillingPeriod.MONTH,
    billingAnchorDay: 1,
    trialStartedAt: minsk('2026-10-01'),
    trialEndsAt: minsk('2026-11-01'),
    trialUserId: 'owner-1',
    paidUntil: minsk('2026-12-01'),
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
    createdAt: minsk('2026-10-01'),
    updatedAt: minsk('2026-10-01'),
    plan: START_PLAN,
    ...overrides,
  };
}

/** An open OFFLINE request #42 for START, month. */
export function pendingPayment(
  overrides: Partial<SubscriptionPayment> = {},
): SubscriptionPayment {
  return {
    id: 'pay-1',
    number: 42,
    subscriptionId: 'sub-1',
    brandId: 'brand-1',
    planId: START.id,
    planName: START.name,
    billingPeriod: BillingPeriod.MONTH,
    countryCode: 'BY',
    currency: 'BYN',
    amount: new Prisma.Decimal('29.00'),
    provider: SubscriptionPaymentProvider.OFFLINE,
    status: SubscriptionPaymentStatus.PENDING,
    method: null,
    externalId: null,
    providerData: null,
    reference: null,
    failureReason: null,
    ownerComment: null,
    expiresAt: minsk('2026-12-04'),
    paidAt: null,
    confirmedAt: null,
    periodStart: null,
    periodEnd: null,
    createdById: 'owner-1',
    createdByRole: BillingActorRole.OWNER,
    confirmedById: null,
    adminNote: null,
    createdAt: new Date('2026-11-20T09:00:00Z'),
    updatedAt: new Date('2026-11-20T09:00:00Z'),
    ...overrides,
  };
}

/** Prisma client mock with the payment table; used both as db and as tx. */
function paymentClient() {
  return {
    $transaction: vi.fn(),
    subscriptionPayment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      updateManyAndReturn: vi.fn(),
    },
  };
}

/**
 * Collaborators of the payment write services. db.$transaction runs on tx,
 * subscriptions.withLock behaves like the real one (transaction, lockOrThrow,
 * invalidate), tx create/update echo the data. SubscriptionPaymentService and
 * PaymentApplicationService are real, on top of these mocks.
 */
export function paymentMocks() {
  const db = paymentClient();
  const tx = paymentClient();
  db.$transaction.mockImplementation((cb: (t: unknown) => unknown) => cb(tx));
  tx.subscriptionPayment.create.mockImplementation(async ({ data }) =>
    pendingPayment({ ...data, id: 'pay-new' }),
  );
  tx.subscriptionPayment.update.mockImplementation(async ({ where, data }) =>
    pendingPayment({ id: where.id, ...data }),
  );

  const subscriptions = {
    findByBrandOrThrow: vi.fn().mockResolvedValue(paidSubscription()),
    lock: vi.fn(),
    lockOrThrow: vi.fn().mockResolvedValue(paidSubscription()),
    invalidate: vi.fn(),
    invalidateMany: vi.fn(),
    withLock: vi.fn(
      async (
        brandId: string,
        change: (s: SubscriptionWithPlan, t: unknown) => Promise<unknown>,
      ) => {
        const result = await db.$transaction(async (t: unknown) =>
          change(await subscriptions.lockOrThrow(brandId, t), t),
        );
        await subscriptions.invalidate(brandId);
        return result;
      },
    ),
  };
  const events = { record: vi.fn(), recordMany: vi.fn() };
  const periods = {
    applyPayment: vi.fn().mockResolvedValue(APPLIED_PERIOD),
    extendGraceForRequest: vi.fn(),
  };
  const settings = {
    read: vi.fn().mockResolvedValue({ ...PAYMENT_SETTINGS }),
    get: vi.fn().mockResolvedValue({ ...PAYMENT_SETTINGS }),
  };
  const plans = { findAllCached: vi.fn().mockResolvedValue([START]) };
  const providers = new PaymentProviderRegistry([
    new OfflinePaymentProvider(),
    new ComplimentaryPaymentProvider(),
  ]);

  return {
    db,
    tx,
    subscriptions,
    events,
    periods,
    settings,
    plans,
    providers,
    payments: new SubscriptionPaymentService(db as never),
    application: new PaymentApplicationService(periods as never),
    /** Types of the events written through SubscriptionEventService.record. */
    eventTypes: () => events.record.mock.calls.map((c) => c[1]),
  };
}

export type PaymentMocks = ReturnType<typeof paymentMocks>;

export function createPaymentRequestService(
  m: PaymentMocks,
): PaymentRequestService {
  return new PaymentRequestService(
    m.db as never,
    m.payments,
    m.subscriptions as never,
    m.events as never,
    m.periods as never,
    m.settings as never,
    m.providers,
  );
}
