import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import {
  CUSTOM,
  NOW,
  rejection,
  subscription,
} from '../../testing/owner-billing.fixtures.js';
import { ownerBillingHarness } from '../../testing/owner-billing.harness.js';
import { BrandPlanChangeService } from './brand-plan-change.service.js';

function setup(options: Parameters<typeof ownerBillingHarness>[0] = {}) {
  const h = ownerBillingHarness(options);
  const subscriptionPlans = {
    changePlan: vi.fn().mockResolvedValue(undefined),
  };
  const requests = { cancelPending: vi.fn().mockResolvedValue(null) };
  const service = new BrandPlanChangeService(
    {} as never,
    h.subscriptions,
    subscriptionPlans as never,
    requests as never,
    h.plans as never,
    h.usage,
    {} as never,
  );
  return { ...h, service, subscriptionPlans, requests };
}

describe('BrandPlanChangeService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('change', () => {
    const dto = { planCode: 'team' };

    it('rejects an owner on a CUSTOM plan', async () => {
      const { service, subscriptionPlans } = setup({
        subscription: subscription({ planId: CUSTOM.id, plan: CUSTOM }),
      });

      const error = await rejection(
        service.change('brand-1', dto, 'user-1', NOW),
      );

      expect(error.errorCode).toBe(
        ErrorCode.SUBSCRIPTION_PLAN_MANAGED_BY_SUPPORT.code,
      );
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(subscriptionPlans.changePlan).not.toHaveBeenCalled();
    });

    it('rejects a change without a paid remainder', async () => {
      const { service, subscriptionPlans, requests } = setup({
        subscription: subscription({
          paidUntil: new Date('2026-06-01T00:00:00Z'),
        }),
      });

      const error = await rejection(
        service.change('brand-1', dto, 'user-1', NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.SUBSCRIPTION_NO_PAID_PERIOD.code);
      expect(requests.cancelPending).not.toHaveBeenCalled();
      expect(subscriptionPlans.changePlan).not.toHaveBeenCalled();
    });

    it('rejects a trial without a paid period', async () => {
      const { service } = setup({
        subscription: subscription({
          trialEndsAt: new Date('2026-07-01T00:00:00Z'),
          paidUntil: null,
        }),
      });

      const error = await rejection(
        service.change('brand-1', dto, 'user-1', NOW),
      );

      expect(error.errorCode).toBe(ErrorCode.SUBSCRIPTION_NO_PAID_PERIOD.code);
    });
  });
});
