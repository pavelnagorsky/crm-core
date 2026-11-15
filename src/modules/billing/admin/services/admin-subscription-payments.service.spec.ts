import { Logger } from '@nestjs/common';
import {
  BillingActorRole,
  BillingPeriod,
  Prisma,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { PaymentMailService } from '../../mail/services/payment-mail.service.js';
import { NOW, SOLO } from '../../testing/admin-billing.fixtures.js';
import { AdminSubscriptionPaymentsService } from './admin-subscription-payments.service.js';

function payment(
  overrides: Partial<SubscriptionPayment> = {},
): SubscriptionPayment {
  return {
    id: 'pay-1',
    number: 123,
    subscriptionId: 'sub-brand-1',
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
    expiresAt: null,
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

function setup(
  paymentMail: Pick<PaymentMailService, 'received'> = {
    received: vi.fn().mockResolvedValue(undefined),
  },
) {
  const payments = { findById: vi.fn() };
  const confirmation = { confirm: vi.fn() };
  const brands = { findName: vi.fn(async (id: string) => `Brand ${id}`) };
  const service = new AdminSubscriptionPaymentsService(
    payments as never,
    confirmation as never,
    {} as never,
    paymentMail as never,
    brands as never,
  );
  return { service, payments, confirmation, paymentMail };
}

describe('AdminSubscriptionPaymentsService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('confirm', () => {
    const dto = {
      paidAt: '2026-06-14T10:00:00Z',
      method: SubscriptionPaymentMethod.ERIP,
      reference: 'ERIP-1',
    };

    function confirming(
      applied: boolean,
      paymentMail?: Pick<PaymentMailService, 'received'>,
    ) {
      const ctx = setup(paymentMail);
      const current = payment({
        amount: new Prisma.Decimal('25'),
        currency: 'BYN',
      });
      const paid = { ...current, status: SubscriptionPaymentStatus.PAID };
      ctx.payments.findById.mockResolvedValue(current);
      ctx.confirmation.confirm.mockResolvedValue({ payment: paid, applied });
      return { ...ctx, paid };
    }

    it('confirms with the amount and currency of the request snapshot', async () => {
      const ctx = confirming(true);

      const result = await ctx.service.confirm('pay-1', dto, 'admin-1', NOW);

      const [id, input, now] = ctx.confirmation.confirm.mock.calls[0] as [
        string,
        {
          amount: Prisma.Decimal;
          currency: string;
          paidAt: Date;
          method: string;
        },
        Date,
      ];
      expect(id).toBe('pay-1');
      expect(input.amount.toString()).toBe('25');
      expect(input.currency).toBe('BYN');
      expect(input.paidAt).toEqual(new Date(dto.paidAt));
      expect(input).toMatchObject({
        method: SubscriptionPaymentMethod.ERIP,
        reference: 'ERIP-1',
        adminNote: null,
        actor: { id: 'admin-1', role: BillingActorRole.ADMIN },
      });
      expect(now).toBe(NOW);
      expect(result).toEqual({ payment: ctx.paid, brandName: 'Brand brand-1' });
    });

    it('emails the receipt when the payment is applied', async () => {
      const ctx = confirming(true);

      await ctx.service.confirm('pay-1', dto, 'admin-1', NOW);

      expect(ctx.paymentMail.received).toHaveBeenCalledWith(ctx.paid);
    });

    it('sends no receipt when the payment was not applied', async () => {
      const ctx = confirming(false);

      await ctx.service.confirm('pay-1', dto, 'admin-1', NOW);

      expect(ctx.paymentMail.received).not.toHaveBeenCalled();
    });

    it('does not fail the confirmation when the receipt email fails', async () => {
      const logError = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      // The real PaymentMailService: it swallows and logs the failure itself.
      const sender = {
        owners: vi.fn().mockRejectedValue(new Error('smtp down')),
      };
      const paymentMail = new PaymentMailService(
        sender as never,
        {} as never,
        {} as never,
        { findByBrand: vi.fn().mockResolvedValue(null) } as never,
        { findName: vi.fn().mockResolvedValue('Brand brand-1') } as never,
        {} as never,
      );
      const received = vi.spyOn(paymentMail, 'received');
      const ctx = confirming(true, paymentMail);

      await expect(
        ctx.service.confirm('pay-1', dto, 'admin-1', NOW),
      ).resolves.toMatchObject({ payment: ctx.paid });
      expect(received).toHaveBeenCalledWith(ctx.paid);
      expect(logError).toHaveBeenCalled();
    });
  });
});
