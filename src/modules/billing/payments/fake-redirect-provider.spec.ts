import {
  BillingActorRole,
  BillingPeriod,
  BillingPlanPricingMode,
  BillingPlanStatus,
  Prisma,
  Subscription,
  SubscriptionEventType,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { Logger } from '@nestjs/common';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../constants/billing-actors.js';
import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { ConfirmPaymentInput } from '../interfaces/confirm-payment-input.interface.js';
import { PaymentNextAction } from '../interfaces/payment-next-action.type.js';
import { PaymentProvider } from '../interfaces/payment-provider.interface.js';
import { PaymentStartContext } from '../interfaces/payment-start-context.interface.js';
import { SubscriptionPaymentService } from './services/subscription-payment.service.js';
import { PaymentApplicationService } from './services/payment-application.service.js';
import { PaymentConfirmationService } from './services/payment-confirmation.service.js';
import { PaymentRequestService } from './services/payment-request.service.js';
import { SubscriptionEventService } from '../subscriptions/services/subscription-event.service.js';
import { SubscriptionPeriodService } from '../subscriptions/services/subscription-period.service.js';
import { SubscriptionService } from '../subscriptions/services/subscription.service.js';
import { OfflinePaymentProvider } from './offline/offline-payment.provider.js';
import { PaymentProviderRegistry } from './payment-provider.registry.js';

/**
 * Plan section 15: an online provider plugs in through PaymentProvider alone. The
 * services below are the real ones; only the database is in memory.
 */
const FAKE = 'FAKE_ONLINE' as SubscriptionPaymentProvider;

interface FakeWebhook {
  orderId: string;
  transactionId: string;
  amount: string;
  currency: string;
  paidAt: string;
}

class FakeRedirectProvider implements PaymentProvider {
  readonly code = FAKE;
  readonly capabilities = {
    ownerInitiated: true,
    adminConfirmable: false,
    webhooks: true,
    statusPolling: true,
    recurring: false,
  };

  start(
    payment: SubscriptionPayment,
    ctx: PaymentStartContext,
  ): Promise<PaymentNextAction> {
    return Promise.resolve({
      type: PaymentNextActionType.REDIRECT,
      url: `https://pay.example/checkout/${payment.id}?return=${encodeURIComponent(ctx.returnUrl)}`,
      expiresAt: payment.expiresAt,
    });
  }

  parseWebhook(body: FakeWebhook): {
    paymentId: string;
    input: ConfirmPaymentInput;
  } {
    return {
      paymentId: body.orderId,
      input: {
        paidAt: new Date(body.paidAt),
        method: SubscriptionPaymentMethod.CARD,
        amount: body.amount,
        currency: body.currency,
        externalId: body.transactionId,
        providerData: { ...body },
        actor: BillingActors.provider(),
      },
    };
  }
}

const TZ = 'Europe/Minsk';
const minsk = (date: string) => new Date(Date.parse(`${date}T00:00:00+03:00`));

const START: BillingPlanWithPrices = {
  id: 'start',
  code: 'start',
  name: 'Start',
  position: 1,
  status: BillingPlanStatus.ACTIVE,
  isPublic: true,
  pricingMode: BillingPlanPricingMode.STANDARD,
  staffLimit: null,
  locationLimit: null,
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
const { prices: _prices, ...START_PLAN } = START;

function initialSubscription(
  overrides: Partial<Subscription> = {},
): Subscription {
  return {
    id: 'sub-1',
    brandId: 'brand-1',
    countryCode: 'BY',
    timezone: TZ,
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
    ...overrides,
  };
}

type Where = Record<string, unknown>;

/** Just enough of Prisma for the payment flow, with row state kept between calls. */
function memoryDb(subscription: Subscription, clock: { now: Date }) {
  const subscriptions = new Map([[subscription.brandId, { ...subscription }]]);
  const payments = new Map<string, SubscriptionPayment>();
  const events: {
    type: SubscriptionEventType;
    actorRole: BillingActorRole;
    payload: unknown;
  }[] = [];
  let lastNumber = 0;

  const matches = (row: Record<string, unknown>, where: Where) =>
    Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === 'object' && 'in' in condition)
        return (condition.in as unknown[]).includes(row[key]);
      if (condition && typeof condition === 'object' && 'lt' in condition)
        return (row[key] as Date) < (condition.lt as Date);
      return row[key] === condition;
    });
  const withPlan = (s: Subscription) => ({
    ...s,
    plan: s.planId === START.id ? START_PLAN : null,
  });
  const updatePayment = (id: string, data: Partial<SubscriptionPayment>) => {
    const defined = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    );
    const updated = { ...payments.get(id)!, ...defined, updatedAt: clock.now };
    payments.set(id, updated);
    return { ...updated };
  };

  const db = {
    $queryRaw: async (_sql: TemplateStringsArray, brandId: string) => {
      const s = subscriptions.get(brandId);
      return s ? [{ id: s.id }] : [];
    },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(db),
    subscription: {
      findUnique: async ({ where }: { where: { brandId: string } }) => {
        const s = subscriptions.get(where.brandId);
        return s ? withPlan(s) : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Subscription>;
      }) => {
        const s = [...subscriptions.values()].find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return { ...s };
      },
    },
    subscriptionPayment: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const p = payments.get(where.id);
        return p ? { ...p } : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const p = payments.get(where.id);
        if (!p) throw new Error('not found');
        return { ...p };
      },
      findFirst: async ({ where }: { where: Where }) => {
        const p = [...payments.values()].find((x) => matches(x, where));
        return p ? { ...p } : null;
      },
      create: async ({ data }: { data: Partial<SubscriptionPayment> }) => {
        lastNumber += 1;
        const p = {
          status: SubscriptionPaymentStatus.PENDING,
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
          createdById: null,
          confirmedById: null,
          adminNote: null,
          ...data,
          id: `pay-${lastNumber}`,
          number: lastNumber,
          createdAt: clock.now,
          updatedAt: clock.now,
        } as SubscriptionPayment;
        payments.set(p.id, p);
        return { ...p };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<SubscriptionPayment>;
      }) => updatePayment(where.id, data),
      updateMany: async ({
        where,
        data,
      }: {
        where: Where;
        data: Partial<SubscriptionPayment>;
      }) => {
        const ids = [...payments.values()]
          .filter((p) => matches(p, where))
          .map((p) => p.id);
        for (const id of ids) updatePayment(id, data);
        return { count: ids.length };
      },
    },
    subscriptionEvent: {
      create: async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return data;
      },
    },
  };
  return { db, subscriptions, payments, events };
}

describe('Fake REDIRECT provider through the shared payment flow', () => {
  const provider = new FakeRedirectProvider();
  const registry = new PaymentProviderRegistry([
    new OfflinePaymentProvider(),
    provider,
  ]);
  const billingSettings = {
    id: 1,
    defaultCountryCode: 'BY',
    trialDays: 30,
    graceDays: 3,
    reminderDaysBefore: [7, 3, 1],
    paymentProvider: FAKE,
    paymentRequestTtlDays: 14,
    pendingRequestGraceDays: 3,
    offlinePaymentInstructions: null,
    adminNotifyEmail: null,
    enforcementEnabled: true,
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    updatedById: null,
  };
  const ctx = {
    settings: billingSettings,
    returnUrl: 'https://app.klendo.by/billing',
  };

  let clock: { now: Date };
  let store: ReturnType<typeof memoryDb>;
  let subscriptions: SubscriptionService;
  let requests: PaymentRequestService;
  let confirmation: PaymentConfirmationService;

  const setup = (subscription: Subscription) => {
    store = memoryDb(subscription, clock);
    const settings = {
      read: async () => billingSettings,
      get: async () => billingSettings,
    };
    const plans = { findAllCached: async () => [START] };
    const db = store.db as never;
    subscriptions = new SubscriptionService(db, {
      invalidate: vi.fn(),
    } as never);
    const payments = new SubscriptionPaymentService(db);
    const events = new SubscriptionEventService(db);
    const periods = new SubscriptionPeriodService(
      events,
      settings as never,
      plans as never,
    );
    requests = new PaymentRequestService(
      db,
      payments,
      subscriptions,
      events,
      periods,
      settings as never,
      registry,
    );
    confirmation = new PaymentConfirmationService(
      db,
      payments,
      subscriptions,
      events,
      new PaymentApplicationService(periods),
      registry,
    );
  };

  const request = () =>
    store.db.$transaction(async (tx) => {
      const locked = await subscriptions.lockOrThrow('brand-1', tx as never);
      return requests.create(
        locked,
        {
          plan: START_PLAN,
          billingPeriod: BillingPeriod.MONTH,
          price: {
            countryCode: 'BY',
            currency: 'BYN',
            amount: new Prisma.Decimal('29'),
          },
          comment: null,
          actor: BillingActors.owner('owner-1'),
        },
        tx as never,
        clock.now,
      );
    }) as Promise<SubscriptionPayment>;

  const webhook = (
    payment: SubscriptionPayment,
    overrides: Partial<FakeWebhook> = {},
  ) => {
    const { paymentId, input } = provider.parseWebhook({
      orderId: payment.id,
      transactionId: 'txn-1',
      amount: '29.00',
      currency: 'BYN',
      paidAt: '2026-11-25T10:05:00Z',
      ...overrides,
    });
    return confirmation.confirm(paymentId, input, clock.now);
  };

  beforeEach(() => {
    clock = { now: new Date('2026-11-25T10:00:00Z') };
    setup(initialSubscription());
  });

  it('a request returns REDIRECT', async () => {
    const payment = await request();

    expect(payment.provider).toBe(FAKE);
    await expect(registry.nextAction(payment, ctx)).resolves.toEqual({
      type: PaymentNextActionType.REDIRECT,
      url: `https://pay.example/checkout/${payment.id}?return=${encodeURIComponent(ctx.returnUrl)}`,
      expiresAt: minsk('2026-12-09'),
    });
  });

  it('a confirmation from the webhook extends the subscription', async () => {
    const payment = await request();
    clock.now = new Date('2026-11-25T10:06:00Z');

    const result = await webhook(payment);

    expect(result.applied).toBe(true);
    expect(result.payment).toMatchObject({
      status: SubscriptionPaymentStatus.PAID,
      method: SubscriptionPaymentMethod.CARD,
      externalId: 'txn-1',
      paidAt: new Date('2026-11-25T10:05:00Z'),
      periodStart: minsk('2026-12-01'),
      periodEnd: minsk('2027-01-01'),
    });
    expect(store.subscriptions.get('brand-1')).toMatchObject({
      paidUntil: minsk('2027-01-01'),
      accessEndsAt: minsk('2027-01-01'),
      billingAnchorDay: 1,
    });
    expect(store.events.map((e) => [e.type, e.actorRole])).toEqual([
      [SubscriptionEventType.PAYMENT_CREATED, BillingActorRole.OWNER],
      [SubscriptionEventType.PAYMENT_APPLIED, BillingActorRole.PROVIDER],
    ]);
    await expect(registry.nextAction(result.payment, ctx)).resolves.toEqual({
      type: PaymentNextActionType.NONE,
    });
  });

  it('a repeated webhook is idempotent', async () => {
    const payment = await request();
    clock.now = new Date('2026-11-25T10:06:00Z');
    await webhook(payment);
    const eventsAfterFirst = store.events.length;

    clock.now = new Date('2026-11-25T10:30:00Z');
    const again = await webhook(payment);

    expect(again.applied).toBe(false);
    expect(store.subscriptions.get('brand-1')?.paidUntil).toEqual(
      minsk('2027-01-01'),
    );
    expect(store.events).toHaveLength(eventsAfterFirst);
  });

  it('a platform admin cannot mark an online payment as paid', async () => {
    const payment = await request();
    await expect(
      confirmation.confirm(
        payment.id,
        {
          paidAt: clock.now,
          method: SubscriptionPaymentMethod.CASH,
          amount: '29.00',
          currency: 'BYN',
          actor: BillingActors.admin('admin-1'),
        },
        clock.now,
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.SUBSCRIPTION_PAYMENT_NOT_CONFIRMABLE.code,
    });
    expect(store.payments.get(payment.id)?.status).toBe(
      SubscriptionPaymentStatus.PENDING,
    );
  });

  it('a webhook with another amount records PAYMENT_MISMATCH and changes nothing', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const payment = await request();
    clock.now = new Date('2026-11-25T10:06:00Z');

    const result = await webhook(payment, { amount: '9.00' });

    expect(result.applied).toBe(false);
    expect(store.payments.get(payment.id)?.status).toBe(
      SubscriptionPaymentStatus.PENDING,
    );
    expect(store.subscriptions.get('brand-1')?.paidUntil).toEqual(
      minsk('2026-12-01'),
    );
    expect(store.events.at(-1)).toMatchObject({
      type: SubscriptionEventType.PAYMENT_MISMATCH,
      payload: {
        receivedAmount: '9.00',
        receivedCurrency: 'BYN',
        externalId: 'txn-1',
      },
    });
    error.mockRestore();
  });

  it('a new request replaces the open one', async () => {
    const first = await request();
    const second = await request();

    expect(store.payments.get(first.id)).toMatchObject({
      status: SubscriptionPaymentStatus.CANCELED,
      failureReason: 'replaced',
    });
    expect(store.payments.get(second.id)?.status).toBe(
      SubscriptionPaymentStatus.PENDING,
    );
  });

  it('an online request in PAST_DUE grants no extra grace', async () => {
    // Access ended 01.12, grace runs to 04.12; the owner pays online right away.
    clock.now = new Date('2026-12-02T10:00:00Z');
    await request();

    expect(store.subscriptions.get('brand-1')?.graceExtendedUntil).toBeNull();
    expect(store.events.map((e) => e.type)).not.toContain(
      SubscriptionEventType.GRACE_EXTENDED,
    );
  });
});
