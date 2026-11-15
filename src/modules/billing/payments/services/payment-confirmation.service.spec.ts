import { Logger, NotFoundException } from '@nestjs/common';
import {
  SubscriptionEventType,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../../constants/billing-actors.js';
import {
  APPLIED_PERIOD,
  minsk,
  paidSubscription,
  PaymentMocks,
  paymentMocks,
  pendingPayment,
} from '../../testing/payment.fixtures.js';
import { PaymentConfirmationService } from './payment-confirmation.service.js';

describe('PaymentConfirmationService', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const admin = BillingActors.admin('admin-1');
  const paidAt = new Date('2026-11-20T09:30:00Z');
  const input = (overrides = {}) => ({
    paidAt,
    method: SubscriptionPaymentMethod.ERIP,
    amount: '29',
    currency: 'byn',
    reference: 'erip-1',
    actor: admin,
    ...overrides,
  });

  let m: PaymentMocks;
  let service: PaymentConfirmationService;

  beforeEach(() => {
    m = paymentMocks();
    service = new PaymentConfirmationService(
      m.db as never,
      m.payments,
      m.subscriptions as never,
      m.events as never,
      m.application,
      m.providers,
    );
    m.db.subscriptionPayment.findUnique.mockResolvedValue(pendingPayment());
    m.tx.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
    m.tx.subscriptionPayment.findUniqueOrThrow.mockResolvedValue(
      pendingPayment({ status: SubscriptionPaymentStatus.PAID, paidAt }),
    );
  });

  describe('confirm', () => {
    it('marks the payment PAID, applies it and writes the period', async () => {
      const result = await service.confirm('pay-1', input(), now);

      expect(m.tx.subscriptionPayment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'pay-1',
          status: {
            in: [
              SubscriptionPaymentStatus.PENDING,
              SubscriptionPaymentStatus.CANCELED,
              SubscriptionPaymentStatus.EXPIRED,
              SubscriptionPaymentStatus.FAILED,
            ],
          },
        },
        data: expect.objectContaining({
          status: SubscriptionPaymentStatus.PAID,
          paidAt,
          confirmedAt: now,
          method: SubscriptionPaymentMethod.ERIP,
          reference: 'erip-1',
          confirmedById: 'admin-1',
          failureReason: null,
        }),
      });
      expect(m.periods.applyPayment).toHaveBeenCalledWith(
        paidSubscription(),
        expect.objectContaining({ status: SubscriptionPaymentStatus.PAID }),
        admin,
        m.tx,
        now,
        undefined,
      );
      expect(m.tx.subscriptionPayment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: {
          periodStart: APPLIED_PERIOD.periodStart,
          periodEnd: APPLIED_PERIOD.periodEnd,
        },
      });
      expect(result.applied).toBe(true);
      expect(m.subscriptions.invalidate).toHaveBeenCalledWith('brand-1');
    });

    it.each([
      SubscriptionPaymentStatus.EXPIRED,
      SubscriptionPaymentStatus.CANCELED,
    ])('an admin can confirm a %s request', async (status) => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(
        pendingPayment({ status }),
      );
      await expect(
        service.confirm('pay-1', input(), now),
      ).resolves.toMatchObject({
        applied: true,
      });
    });

    it('a second admin confirmation is rejected', async () => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(
        pendingPayment({ status: SubscriptionPaymentStatus.PAID }),
      );
      await expect(
        service.confirm('pay-1', input(), now),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_PAYMENT_NOT_CONFIRMABLE.code,
        payload: {
          status: SubscriptionPaymentStatus.PAID,
          provider: SubscriptionPaymentProvider.OFFLINE,
        },
      });
      expect(m.periods.applyPayment).not.toHaveBeenCalled();
    });

    it('a repeated provider confirmation is a no-op', async () => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(
        pendingPayment({ status: SubscriptionPaymentStatus.PAID }),
      );
      await expect(
        service.confirm(
          'pay-1',
          input({ actor: BillingActors.provider() }),
          now,
        ),
      ).resolves.toMatchObject({ applied: false });
      expect(m.db.$transaction).not.toHaveBeenCalled();
    });

    it('a concurrent confirmation does not apply the payment twice', async () => {
      m.tx.subscriptionPayment.updateMany.mockResolvedValue({ count: 0 });
      const result = await service.confirm('pay-1', input(), now);
      expect(result.applied).toBe(false);
      expect(m.periods.applyPayment).not.toHaveBeenCalled();
      expect(m.tx.subscriptionPayment.update).not.toHaveBeenCalled();
    });

    it('an admin cannot confirm a COMPLIMENTARY payment', async () => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(
        pendingPayment({ provider: SubscriptionPaymentProvider.COMPLIMENTARY }),
      );
      await expect(
        service.confirm('pay-1', input(), now),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_PAYMENT_NOT_CONFIRMABLE.code,
      });
    });

    it('an unknown payment is not found', async () => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(null);
      await expect(
        service.confirm('nope', input(), now),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('accepts paidAt a little after the server clock', async () => {
      await expect(
        service.confirm(
          'pay-1',
          input({ paidAt: new Date(now.getTime() + 30_000) }),
          now,
        ),
      ).resolves.toMatchObject({ applied: true });
    });

    it.each([
      ['in the future', new Date('2026-11-20T10:05:00Z')],
      ['before the request day', minsk('2026-11-19')],
    ])('rejects paidAt %s', async (_label, date) => {
      await expect(
        service.confirm('pay-1', input({ paidAt: date }), now),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_PAYMENT_DATE_INVALID.code,
      });
      expect(m.db.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['amount', { amount: '28.99' }],
      ['currency', { currency: 'RUB' }],
    ])(
      'a different %s records PAYMENT_MISMATCH and applies nothing',
      async (_label, diff) => {
        const error = vi
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);

        const result = await service.confirm('pay-1', input(diff), now);

        expect(result).toMatchObject({
          applied: false,
          payment: { status: SubscriptionPaymentStatus.PENDING },
        });
        expect(m.events.record).toHaveBeenCalledWith(
          { id: 'sub-1', brandId: 'brand-1' },
          SubscriptionEventType.PAYMENT_MISMATCH,
          admin,
          expect.objectContaining({ paymentId: 'pay-1' }),
          m.db,
        );
        expect(m.db.$transaction).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
        error.mockRestore();
      },
    );
  });
});
