import { BadRequestException } from '@nestjs/common';
import {
  BillingActorRole,
  BillingPeriod,
  Prisma,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../../constants/billing-actors.js';
import {
  APPLIED_PERIOD,
  createPaymentRequestService,
  minsk,
  paidSubscription,
  PaymentMocks,
  paymentMocks,
  pendingPayment,
  PRO_PLAN,
  START_PLAN,
} from '../../testing/payment.fixtures.js';
import { ManualPaymentService } from './manual-payment.service.js';

describe('ManualPaymentService', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const admin = BillingActors.admin('admin-1');

  let m: PaymentMocks;
  let service: ManualPaymentService;

  beforeEach(() => {
    m = paymentMocks();
    service = new ManualPaymentService(
      m.subscriptions as never,
      createPaymentRequestService(m),
      m.application,
      m.settings as never,
      m.plans as never,
    );
  });

  describe('recordPayment', () => {
    const input = (overrides = {}) => ({
      plan: START_PLAN,
      billingPeriod: BillingPeriod.MONTH,
      amount: new Prisma.Decimal('29'),
      currency: 'byn',
      paidAt: new Date('2026-11-19T12:00:00Z'),
      method: SubscriptionPaymentMethod.BANK_TRANSFER,
      reference: 'pp-17',
      adminNote: null,
      actor: admin,
      ...overrides,
    });

    it('creates a PAID OFFLINE payment and applies it', async () => {
      const result = await service.recordPayment('brand-1', input(), now);

      expect(
        m.tx.subscriptionPayment.create.mock.calls[0][0].data,
      ).toMatchObject({
        provider: SubscriptionPaymentProvider.OFFLINE,
        status: SubscriptionPaymentStatus.PAID,
        currency: 'BYN',
        countryCode: 'BY',
        paidAt: new Date('2026-11-19T12:00:00Z'),
        confirmedAt: now,
        confirmedById: 'admin-1',
        createdByRole: BillingActorRole.ADMIN,
      });
      expect(m.periods.applyPayment).toHaveBeenCalledTimes(1);
      expect(m.periods.applyPayment.mock.calls[0][5]).toBeUndefined();
      expect(result).toMatchObject({
        periodStart: APPLIED_PERIOD.periodStart,
        periodEnd: APPLIED_PERIOD.periodEnd,
      });
      expect(m.subscriptions.invalidate).toHaveBeenCalledWith('brand-1');
    });

    it('keeps the open request when the plan is the same', async () => {
      await service.recordPayment('brand-1', input(), now);
      expect(m.tx.subscriptionPayment.findFirst).not.toHaveBeenCalled();
    });

    it('cancels the open request when the plan changes', async () => {
      m.tx.subscriptionPayment.findFirst.mockResolvedValue(
        pendingPayment({ id: 'pay-old' }),
      );
      await service.recordPayment('brand-1', input({ plan: PRO_PLAN }), now);
      expect(m.tx.subscriptionPayment.update).toHaveBeenCalledWith({
        where: { id: 'pay-old' },
        data: {
          status: SubscriptionPaymentStatus.CANCELED,
          failureReason: 'plan_changed',
        },
      });
    });

    it('rejects a zero amount and a future date', async () => {
      await expect(
        service.recordPayment(
          'brand-1',
          input({ amount: new Prisma.Decimal(0) }),
          now,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.recordPayment(
          'brand-1',
          input({ paidAt: new Date('2026-11-21T00:00:00Z') }),
          now,
        ),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_PAYMENT_DATE_INVALID.code,
      });
      expect(m.tx.subscriptionPayment.create).not.toHaveBeenCalled();
    });
  });

  describe('extendComplimentary', () => {
    it('needs exactly one of days and until', async () => {
      await expect(
        service.extendComplimentary(
          'brand-1',
          { reason: 'x', actor: admin },
          now,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.extendComplimentary(
          'brand-1',
          { days: 3, until: '2027-01-01', reason: 'x', actor: admin },
          now,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('needs a plan', async () => {
      m.subscriptions.lockOrThrow.mockResolvedValue(
        paidSubscription({ planId: null, plan: null }),
      );
      await expect(
        service.extendComplimentary(
          'brand-1',
          { days: 3, reason: 'x', actor: admin },
          now,
        ),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_PLAN_REQUIRED.code,
      });
    });

    it('creates a zero COMPLIMENTARY payment and extends by days', async () => {
      await service.extendComplimentary(
        'brand-1',
        { days: 10, reason: 'outage', actor: admin },
        now,
      );

      const { data } = m.tx.subscriptionPayment.create.mock.calls[0][0];
      expect(data).toMatchObject({
        provider: SubscriptionPaymentProvider.COMPLIMENTARY,
        status: SubscriptionPaymentStatus.PAID,
        method: SubscriptionPaymentMethod.NONE,
        planId: 'start',
        currency: 'BYN',
        adminNote: 'outage',
        paidAt: now,
      });
      expect(data.amount.toFixed(2)).toBe('0.00');
      expect(m.periods.applyPayment.mock.calls[0][5]).toEqual({ days: 10 });
    });

    it('extends to a local date and uses the custom currency', async () => {
      m.subscriptions.lockOrThrow.mockResolvedValue(
        paidSubscription({ customCurrency: 'USD' }),
      );
      await service.extendComplimentary(
        'brand-1',
        { until: '2027-02-01', reason: 'deal', actor: admin },
        now,
      );
      expect(
        m.tx.subscriptionPayment.create.mock.calls[0][0].data.currency,
      ).toBe('USD');
      expect(m.periods.applyPayment.mock.calls[0][5]).toEqual({
        until: minsk('2027-02-01'),
      });
    });
  });
});
