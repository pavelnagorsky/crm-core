import { NotFoundException } from '@nestjs/common';
import { SubscriptionPaymentStatus } from '@prisma/client';
import { PaymentNextActionType } from '../../enums/payment-next-action-type.enum.js';
import { payment } from '../../testing/owner-billing.fixtures.js';
import { ownerBillingHarness } from '../../testing/owner-billing.harness.js';
import { BrandSubscriptionQueryService } from './brand-subscription-query.service.js';

function setup() {
  const h = ownerBillingHarness();
  const payments = { findForBrand: vi.fn() };
  const service = new BrandSubscriptionQueryService(
    h.access,
    payments as never,
    {} as never,
    h.plans as never,
    h.usage,
    h.nextActions,
  );
  return { ...h, service, payments };
}

describe('BrandSubscriptionQueryService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('findPayment', () => {
    it('does not reveal a payment of another brand', async () => {
      const { service, payments } = setup();
      payments.findForBrand.mockRejectedValue(
        new NotFoundException('Payment not found'),
      );

      await expect(
        service.findPayment('brand-1', 'pay-of-brand-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(payments.findForBrand).toHaveBeenCalledWith(
        'brand-1',
        'pay-of-brand-2',
      );
    });

    it('returns no action for a closed payment', async () => {
      const { service, payments } = setup();
      payments.findForBrand.mockResolvedValue(
        payment({ status: SubscriptionPaymentStatus.PAID }),
      );

      const result = await service.findPayment('brand-1', 'pay-1');

      expect(result.nextAction).toEqual({ type: PaymentNextActionType.NONE });
    });
  });
});
