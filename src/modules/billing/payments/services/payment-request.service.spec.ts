import { NotFoundException } from '@nestjs/common';
import {
  BillingActorRole,
  BillingPeriod,
  Prisma,
  SubscriptionEventType,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingActors } from '../../constants/billing-actors.js';
import { PaymentNextActionType } from '../../enums/payment-next-action-type.enum.js';
import {
  createPaymentRequestService,
  minsk,
  PAYMENT_SETTINGS,
  paidSubscription,
  PaymentMocks,
  paymentMocks,
  pendingPayment,
  START_PLAN,
} from '../../testing/payment.fixtures.js';
import { PaymentRequestService } from './payment-request.service.js';

describe('PaymentRequestService', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const owner = BillingActors.owner('owner-1');
  const admin = BillingActors.admin('admin-1');

  let m: PaymentMocks;
  let service: PaymentRequestService;

  beforeEach(() => {
    m = paymentMocks();
    service = createPaymentRequestService(m);
  });

  describe('create', () => {
    const input = {
      plan: START_PLAN,
      billingPeriod: BillingPeriod.MONTH,
      price: {
        countryCode: 'BY',
        currency: 'BYN',
        amount: new Prisma.Decimal('29'),
      },
      comment: 'please',
      actor: owner,
    };

    it('replaces an open request with a new one', async () => {
      m.tx.subscriptionPayment.findFirst.mockResolvedValue(
        pendingPayment({ id: 'pay-old' }),
      );

      const created = await service.create(
        paidSubscription(),
        input,
        m.tx as never,
        now,
      );

      expect(m.tx.subscriptionPayment.update).toHaveBeenCalledWith({
        where: { id: 'pay-old' },
        data: {
          status: SubscriptionPaymentStatus.CANCELED,
          failureReason: 'replaced',
        },
      });
      expect(m.eventTypes()).toEqual([
        SubscriptionEventType.PAYMENT_CANCELED,
        SubscriptionEventType.PAYMENT_CREATED,
      ]);
      expect(created.id).toBe('pay-new');
    });

    it('snapshots plan and price and expires at local midnight TTL days later', async () => {
      m.tx.subscriptionPayment.findFirst.mockResolvedValue(null);

      await service.create(paidSubscription(), input, m.tx as never, now);

      expect(m.tx.subscriptionPayment.update).not.toHaveBeenCalled();
      const { data } = m.tx.subscriptionPayment.create.mock.calls[0][0];
      expect(data).toMatchObject({
        subscriptionId: 'sub-1',
        brandId: 'brand-1',
        planId: 'start',
        planName: 'Start',
        billingPeriod: BillingPeriod.MONTH,
        countryCode: 'BY',
        currency: 'BYN',
        provider: SubscriptionPaymentProvider.OFFLINE,
        ownerComment: 'please',
        expiresAt: minsk('2026-12-04'),
        createdById: 'owner-1',
        createdByRole: BillingActorRole.OWNER,
      });
      expect(data.amount.toFixed(2)).toBe('29.00');
    });

    it('an admin-confirmable provider grants the request grace', async () => {
      m.tx.subscriptionPayment.findFirst.mockResolvedValue(null);
      const sub = paidSubscription();
      await service.create(sub, input, m.tx as never, now);
      expect(m.periods.extendGraceForRequest).toHaveBeenCalledWith(
        sub,
        owner,
        m.tx,
        now,
      );
    });

    it('a provider owners cannot use is rejected before anything is written', async () => {
      m.settings.read.mockResolvedValue({
        ...PAYMENT_SETTINGS,
        paymentProvider: SubscriptionPaymentProvider.COMPLIMENTARY,
      });
      await expect(
        service.create(paidSubscription(), input, m.tx as never, now),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.BILLING_PROVIDER_NOT_AVAILABLE.code,
      });
      expect(m.tx.subscriptionPayment.create).not.toHaveBeenCalled();
    });

    it('OFFLINE next action is the instructions with the payment number', async () => {
      const action = await m.providers.nextAction(pendingPayment(), {
        settings: PAYMENT_SETTINGS as never,
        returnUrl: 'https://app/billing',
      });
      expect(action).toEqual({
        type: PaymentNextActionType.INSTRUCTIONS,
        instructions: 'IBAN BY00 0000',
        reference: 'KL-000042',
        amount: '29.00',
        currency: 'BYN',
        expiresAt: minsk('2026-12-04'),
      });
      await expect(
        m.providers.nextAction(
          pendingPayment({ status: SubscriptionPaymentStatus.PAID }),
          {
            settings: PAYMENT_SETTINGS as never,
            returnUrl: '',
          },
        ),
      ).resolves.toEqual({ type: PaymentNextActionType.NONE });
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      m.tx.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
      m.tx.subscriptionPayment.findUniqueOrThrow.mockResolvedValue(
        pendingPayment({
          status: SubscriptionPaymentStatus.CANCELED,
          failureReason: 'canceled_by_owner',
        }),
      );
    });

    it('an owner cancels only a payment of their brand', async () => {
      m.db.subscriptionPayment.findFirst.mockResolvedValue(null);
      await expect(
        service.cancel('pay-1', owner, { brandId: 'brand-2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(m.db.subscriptionPayment.findFirst).toHaveBeenCalledWith({
        where: { id: 'pay-1', brandId: 'brand-2' },
      });
    });

    it('an owner cancels the open request', async () => {
      m.db.subscriptionPayment.findFirst.mockResolvedValue(pendingPayment());
      await service.cancel('pay-1', owner, { brandId: 'brand-1' });
      expect(
        m.tx.subscriptionPayment.updateMany.mock.calls[0][0],
      ).toMatchObject({
        where: { id: 'pay-1', status: SubscriptionPaymentStatus.PENDING },
        data: {
          status: SubscriptionPaymentStatus.CANCELED,
          failureReason: 'canceled_by_owner',
        },
      });
      expect(m.eventTypes()).toEqual([SubscriptionEventType.PAYMENT_CANCELED]);
      expect(m.subscriptions.invalidate).toHaveBeenCalledWith('brand-1');
    });

    it('an admin cancels with a note', async () => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(pendingPayment());
      await service.cancel('pay-1', admin, { adminNote: 'duplicate' });
      expect(
        m.tx.subscriptionPayment.updateMany.mock.calls[0][0].data,
      ).toMatchObject({
        failureReason: 'canceled_by_admin',
        adminNote: 'duplicate',
      });
    });

    it('a payment that is no longer PENDING cannot be canceled', async () => {
      m.db.subscriptionPayment.findUnique.mockResolvedValue(pendingPayment());
      m.tx.subscriptionPayment.updateMany.mockResolvedValue({ count: 0 });
      m.tx.subscriptionPayment.findUniqueOrThrow.mockResolvedValue(
        pendingPayment({ status: SubscriptionPaymentStatus.PAID }),
      );
      await expect(service.cancel('pay-1', admin)).rejects.toMatchObject({
        errorCode: ErrorCode.SUBSCRIPTION_PAYMENT_NOT_CANCELABLE.code,
        payload: { status: SubscriptionPaymentStatus.PAID },
      });
      expect(m.events.record).not.toHaveBeenCalled();
    });
  });

  describe('expireDue', () => {
    it('expires PENDING requests past expiresAt in one statement with one event each', async () => {
      const expiredPayment = pendingPayment({
        id: 'p1',
        status: SubscriptionPaymentStatus.EXPIRED,
      });
      m.tx.subscriptionPayment.updateManyAndReturn.mockResolvedValue([
        expiredPayment,
      ]);

      const expired = await service.expireDue(now);

      expect(m.tx.subscriptionPayment.updateManyAndReturn).toHaveBeenCalledWith(
        {
          where: {
            status: SubscriptionPaymentStatus.PENDING,
            expiresAt: { lt: now },
          },
          data: { status: SubscriptionPaymentStatus.EXPIRED },
        },
      );
      expect(expired.map((p) => p.id)).toEqual(['p1']);
      const [events, type, actor] = m.events.recordMany.mock.calls[0];
      expect(events).toHaveLength(1);
      expect(events[0].subscription).toEqual({
        id: expiredPayment.subscriptionId,
        brandId: 'brand-1',
      });
      expect(type).toBe(SubscriptionEventType.PAYMENT_EXPIRED);
      expect(actor).toEqual(BillingActors.system());
      expect(m.subscriptions.invalidateMany).toHaveBeenCalledWith(['brand-1']);
    });
  });

  describe('cancelOpenPayments', () => {
    it('does nothing in FREE', async () => {
      m.subscriptions.lock.mockResolvedValue(null);
      await service.cancelOpenPayments('brand-1', m.tx as never);
      expect(m.tx.subscriptionPayment.findFirst).not.toHaveBeenCalled();
    });

    it('cancels the open request when the brand is deleted', async () => {
      m.subscriptions.lock.mockResolvedValue(paidSubscription());
      m.tx.subscriptionPayment.findFirst.mockResolvedValue(pendingPayment());
      await service.cancelOpenPayments('brand-1', m.tx as never);
      expect(m.tx.subscriptionPayment.update.mock.calls[0][0].data).toEqual({
        status: SubscriptionPaymentStatus.CANCELED,
        failureReason: 'brand_deleted',
      });
      expect(m.events.record.mock.calls[0][2]).toEqual(BillingActors.system());
    });
  });
});
