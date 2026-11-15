import { BadRequestException, Logger } from '@nestjs/common';
import {
  BillingPeriod,
  Prisma,
  SubscriptionEventType,
  SubscriptionPaymentProvider,
} from '@prisma/client';
import { BillingActors } from '../../constants/billing-actors.js';
import {
  BILLING_SETTINGS,
  minsk,
  NO_PRICES,
  payment,
  PRO,
  recordedEvents,
  START,
  subscription,
  SubscriptionClientMock,
  subscriptionClients,
  withoutPrices,
} from '../../testing/subscription.fixtures.js';
import { SubscriptionEventService } from './subscription-event.service.js';
import { SubscriptionPeriodService } from './subscription-period.service.js';

describe('SubscriptionPeriodService', () => {
  const settings = { read: vi.fn() };
  const plans = { findAllCached: vi.fn() };
  let tx: SubscriptionClientMock;
  let service: SubscriptionPeriodService;

  const events = () => recordedEvents(tx);

  beforeEach(() => {
    vi.clearAllMocks();
    const clients = subscriptionClients();
    tx = clients.tx;
    settings.read.mockResolvedValue({ ...BILLING_SETTINGS });
    plans.findAllCached.mockResolvedValue([START, PRO, NO_PRICES]);
    service = new SubscriptionPeriodService(
      new SubscriptionEventService(clients.db as never),
      settings as never,
      plans as never,
    );
  });

  describe('applyPayment', () => {
    const actor = BillingActors.admin('admin-1');

    it('a payment during the trial continues from the trial end', async () => {
      const now = new Date('2026-11-20T09:00:00Z');
      const result = await service.applyPayment(
        subscription({
          graceExtendedUntil: minsk('2026-12-07'),
          graceExtendedFor: minsk('2026-12-01'),
        }),
        payment({ paidAt: now }),
        actor,
        tx as never,
        now,
      );

      expect(result).toEqual({
        periodStart: minsk('2026-12-01'),
        periodEnd: minsk('2027-01-01'),
        anchorDay: 1,
      });
      expect(tx.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          planId: START.id,
          billingPeriod: BillingPeriod.MONTH,
          billingAnchorDay: 1,
          paidUntil: minsk('2027-01-01'),
          accessEndsAt: minsk('2027-01-01'),
          graceExtendedUntil: null,
          graceExtendedFor: null,
        },
      });
      expect(events()).toEqual([
        expect.objectContaining({
          type: SubscriptionEventType.PAYMENT_APPLIED,
          payload: expect.objectContaining({
            paymentId: 'pay-1',
            amount: '29.00',
            periodStart: minsk('2026-12-01').toISOString(),
            periodEnd: minsk('2027-01-01').toISOString(),
            paidUntilBefore: null,
          }),
        }),
      ]);
    });

    it('a payment in grace continues the paid chain and keeps the anchor', async () => {
      const now = minsk('2027-02-01');
      const paid = subscription({
        planId: START.id,
        plan: withoutPrices(START),
        billingPeriod: BillingPeriod.MONTH,
        billingAnchorDay: 31,
        trialEndsAt: minsk('2026-10-31'),
        paidUntil: minsk('2027-01-31'),
        accessEndsAt: minsk('2027-01-31'),
      });

      const result = await service.applyPayment(
        paid,
        payment({ paidAt: now }),
        actor,
        tx as never,
        now,
      );

      expect(result).toMatchObject({
        periodStart: minsk('2027-01-31'),
        periodEnd: minsk('2027-02-28'),
        anchorDay: 31,
      });
    });

    it('a payment after the block starts from the local day of payment', async () => {
      const paidAt = new Date('2027-02-10T12:00:00Z');
      const paid = subscription({
        planId: START.id,
        plan: withoutPrices(START),
        billingPeriod: BillingPeriod.MONTH,
        billingAnchorDay: 31,
        trialEndsAt: minsk('2026-10-31'),
        paidUntil: minsk('2027-01-31'),
        accessEndsAt: minsk('2027-01-31'),
      });

      const result = await service.applyPayment(
        paid,
        payment({ paidAt }),
        actor,
        tx as never,
        paidAt,
      );

      expect(result).toMatchObject({
        periodStart: minsk('2027-02-10'),
        periodEnd: minsk('2027-03-10'),
        anchorDay: 10,
      });
    });

    it('a payment for another plan converts the paid remainder first', async () => {
      const now = minsk('2026-12-02');
      const paid = subscription({
        planId: START.id,
        plan: withoutPrices(START),
        billingPeriod: BillingPeriod.MONTH,
        billingAnchorDay: 1,
        trialEndsAt: minsk('2026-10-01'),
        paidUntil: minsk('2027-01-01'),
        accessEndsAt: minsk('2027-01-01'),
      });

      const result = await service.applyPayment(
        paid,
        payment({
          planId: PRO.id,
          planName: PRO.name,
          amount: new Prisma.Decimal('59.00'),
          paidAt: now,
        }),
        actor,
        tx as never,
        now,
      );

      // 30 days × 29 / 59 ≈ 14.75 days → rounded to 17.12.
      expect(result).toEqual({
        periodStart: minsk('2026-12-17'),
        periodEnd: minsk('2027-01-17'),
        anchorDay: 17,
      });
      expect(events()[0].payload).toMatchObject({
        convertedPaidUntil: minsk('2026-12-17').toISOString(),
        paidUntilBefore: minsk('2027-01-01').toISOString(),
      });
      expect(tx.subscription.update.mock.calls[0][0].data).toMatchObject({
        planId: PRO.id,
        paidUntil: minsk('2027-01-17'),
        accessEndsAt: minsk('2027-01-17'),
      });
    });

    it('without a price for the conversion the payment is applied as is', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const now = minsk('2026-12-02');
      const paid = subscription({
        planId: START.id,
        plan: withoutPrices(START),
        billingPeriod: BillingPeriod.MONTH,
        billingAnchorDay: 1,
        trialEndsAt: minsk('2026-10-01'),
        paidUntil: minsk('2027-01-01'),
        accessEndsAt: minsk('2027-01-01'),
      });

      const result = await service.applyPayment(
        paid,
        payment({ planId: NO_PRICES.id, paidAt: now }),
        actor,
        tx as never,
        now,
      );

      expect(warn).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        periodStart: minsk('2027-01-01'),
        periodEnd: minsk('2027-02-01'),
      });
      expect(events()[0].payload).toMatchObject({ convertedPaidUntil: null });
      warn.mockRestore();
    });

    it('a complimentary extension records PERIOD_EXTENDED with the admin note', async () => {
      const now = new Date('2026-11-20T09:00:00Z');
      const result = await service.applyPayment(
        subscription({ planId: START.id, plan: withoutPrices(START) }),
        payment({
          provider: SubscriptionPaymentProvider.COMPLIMENTARY,
          amount: new Prisma.Decimal(0),
          adminNote: 'goodwill',
          paidAt: now,
        }),
        actor,
        tx as never,
        now,
        { days: 10 },
      );

      expect(result).toMatchObject({
        periodStart: minsk('2026-12-01'),
        periodEnd: minsk('2026-12-11'),
        anchorDay: 11,
      });
      expect(events()[0]).toMatchObject({
        type: SubscriptionEventType.PERIOD_EXTENDED,
        payload: { adminNote: 'goodwill', amount: '0.00' },
      });
    });

    it('rejects a period that ends before it starts', async () => {
      const now = new Date('2026-11-20T09:00:00Z');
      await expect(
        service.applyPayment(
          subscription({ planId: START.id, plan: withoutPrices(START) }),
          payment({ paidAt: now }),
          actor,
          tx as never,
          now,
          { until: minsk('2026-11-25') },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('extendGraceForRequest', () => {
    const actor = BillingActors.owner('owner-1');
    // Access ended 01.12; grace runs to 04.12.
    const pastDueAt = minsk('2026-12-02');

    it('extends the grace once per access cycle in PAST_DUE', async () => {
      const sub = subscription();
      await expect(
        service.extendGraceForRequest(sub, actor, tx as never, pastDueAt),
      ).resolves.toBe(true);
      expect(tx.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          graceExtendedUntil: minsk('2026-12-07'),
          graceExtendedFor: minsk('2026-12-01'),
        },
      });
      expect(events()[0].type).toBe(SubscriptionEventType.GRACE_EXTENDED);

      const extended = subscription({
        graceExtendedUntil: minsk('2026-12-07'),
        graceExtendedFor: minsk('2026-12-01'),
      });
      await expect(
        service.extendGraceForRequest(
          extended,
          actor,
          tx as never,
          minsk('2026-12-05'),
        ),
      ).resolves.toBe(false);
      expect(tx.subscription.update).toHaveBeenCalledTimes(1);
    });

    it('does not extend outside PAST_DUE', async () => {
      const trial = minsk('2026-11-20');
      const expired = minsk('2026-12-05');
      await expect(
        service.extendGraceForRequest(
          subscription(),
          actor,
          tx as never,
          trial,
        ),
      ).resolves.toBe(false);
      await expect(
        service.extendGraceForRequest(
          subscription(),
          actor,
          tx as never,
          expired,
        ),
      ).resolves.toBe(false);
      expect(tx.subscription.update).not.toHaveBeenCalled();
    });

    it('does not extend when the setting is 0', async () => {
      settings.read.mockResolvedValue({
        ...BILLING_SETTINGS,
        pendingRequestGraceDays: 0,
      });
      await expect(
        service.extendGraceForRequest(
          subscription(),
          actor,
          tx as never,
          pastDueAt,
        ),
      ).resolves.toBe(false);
    });
  });
});
