import { HttpStatus } from '@nestjs/common';
import { BillingActorRole, BillingPeriod } from '@prisma/client';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { PaymentNextActionType } from '../../enums/payment-next-action-type.enum.js';
import { PaymentRequestInput } from '../../interfaces/payment-request-input.interface.js';
import {
  billingSettings,
  EXPIRED,
  NOW,
  payment,
  rejection,
  subscription,
  TX,
} from '../../testing/owner-billing.fixtures.js';
import { ownerBillingHarness } from '../../testing/owner-billing.harness.js';
import { BrandPaymentRequestService } from './brand-payment-request.service.js';

function setup(options: Parameters<typeof ownerBillingHarness>[0] = {}) {
  const h = ownerBillingHarness(options);
  const requests = {
    create: vi.fn(
      async (_sub: unknown, input: PaymentRequestInput, _tx: unknown) =>
        payment({
          amount: input.price.amount,
          currency: input.price.currency,
          countryCode: input.price.countryCode,
        }),
    ),
  };
  const paymentMail = { requested: vi.fn().mockResolvedValue(undefined) };
  const service = new BrandPaymentRequestService(
    {} as never,
    h.subscriptions,
    h.access,
    requests as never,
    h.settingsService as never,
    h.plans as never,
    h.usage,
    h.nextActions,
    paymentMail as never,
  );
  return { ...h, service, requests, paymentMail };
}

describe('BrandPaymentRequestService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('request', () => {
    const dto = { planCode: 'solo', billingPeriod: BillingPeriod.MONTH };

    it('rejects a FREE brand with SUBSCRIPTION_NOT_STARTED', async () => {
      const { service, requests } = setup({ subscription: null });

      const error = await rejection(
        service.request('brand-1', dto, 'user-1', NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.SUBSCRIPTION_NOT_STARTED.code);
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(requests.create).not.toHaveBeenCalled();
    });

    it('charges the current price of the pricing country', async () => {
      const { service, requests } = setup({
        subscription: subscription({ countryCode: 'PL' }),
      });

      await service.request('brand-1', dto, 'user-1', NOW);

      const input = requests.create.mock.calls[0][1];
      expect(input.plan.code).toBe('solo');
      expect(input.actor).toEqual({
        id: 'user-1',
        role: BillingActorRole.OWNER,
      });
      expect(input.price.countryCode).toBe('BY');
      expect(input.price.currency).toBe('BYN');
      expect(input.price.amount.toString()).toBe('25');
      expect(requests.create.mock.calls[0][2]).toBe(TX);
    });

    it('uses the own country when it has prices', async () => {
      const { service, requests } = setup({
        subscription: subscription({ countryCode: 'KZ' }),
      });

      await service.request('brand-1', dto, 'user-1', NOW);

      const input = requests.create.mock.calls[0][1];
      expect(input.price).toMatchObject({ countryCode: 'KZ', currency: 'KZT' });
      expect(input.price.amount.toString()).toBe('5000');
    });

    it('returns INSTRUCTIONS for an OFFLINE request', async () => {
      const { service, subscriptions } = setup();

      const result = await service.request('brand-1', dto, 'user-1', NOW);

      expect(result.nextAction).toEqual({
        type: PaymentNextActionType.INSTRUCTIONS,
        instructions: 'Pay by ERIP',
        reference: 'KL-000123',
        amount: '25.00',
        currency: 'BYN',
        expiresAt: new Date('2026-06-29T00:00:00Z'),
      });
      expect(subscriptions.invalidate).toHaveBeenCalledWith('brand-1');
    });

    it('rejects a plan that does not fit the usage', async () => {
      const { service, requests } = setup({
        usage: { staff: 5, locations: 1 },
      });

      const error = await rejection(
        service.request('brand-1', dto, 'user-1', NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.PLAN_USAGE_EXCEEDS_LIMITS.code);
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(error.payload).toEqual({
        staff: { limit: 2, used: 5 },
        locations: { limit: 1, used: 1 },
      });
      expect(requests.create).not.toHaveBeenCalled();
    });

    it('lets a blocked brand pay without the limit check', async () => {
      const { service, requests } = setup({
        subscription: subscription(EXPIRED),
        usage: { staff: 5, locations: 1 },
      });

      const result = await service.request('brand-1', dto, 'user-1', NOW);

      expect(result.payment.id).toBe('pay-1');
      expect(requests.create).toHaveBeenCalledTimes(1);
    });

    it('still checks the limits of an EXPIRED brand while enforcement is off', async () => {
      const { service, requests } = setup({
        subscription: subscription(EXPIRED),
        settings: billingSettings({ enforcementEnabled: false }),
        usage: { staff: 5, locations: 1 },
      });

      const error = await rejection(
        service.request('brand-1', dto, 'user-1', NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.PLAN_USAGE_EXCEEDS_LIMITS.code);
      expect(requests.create).not.toHaveBeenCalled();
    });

    // Owner lookup, timezone and best-effort error logging live in PaymentMailService.
    it('hands the emails to the mail service with the requesting user', async () => {
      const { service, paymentMail } = setup();

      const result = await service.request('brand-1', dto, 'user-1', NOW);

      expect(result.payment.id).toBe('pay-1');
      expect(result.nextAction.type).toBe(PaymentNextActionType.INSTRUCTIONS);
      expect(paymentMail.requested).toHaveBeenCalledWith(
        result.payment,
        result.nextAction,
        'user-1',
      );
    });
  });
});
