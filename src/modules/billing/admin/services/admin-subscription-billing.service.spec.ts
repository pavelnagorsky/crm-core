import { HttpStatus } from '@nestjs/common';
import { BillingActorRole, BillingPlanStatus } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { SubscriptionService } from '../../subscriptions/services/subscription.service.js';
import {
  NOW,
  plan,
  subscription,
} from '../../testing/admin-billing.fixtures.js';
import { AdminSubscriptionBillingService } from './admin-subscription-billing.service.js';

const TX = { tx: true };

/**
 * The real SubscriptionService.withLock over a fake transaction, so the lock and the
 * cache reset after commit are observed through lockOrThrow and invalidate.
 */
function setup() {
  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)),
  };
  const order: string[] = [];
  const subscriptions = new SubscriptionService(db as never, {} as never);
  const lockOrThrow = vi.spyOn(subscriptions, 'lockOrThrow');
  const invalidate = vi
    .spyOn(subscriptions, 'invalidate')
    .mockResolvedValue(undefined);
  const subscriptionPlans = {
    assignPlan: vi.fn(async () => {
      order.push('assignPlan');
    }),
  };
  const requests = {
    cancelPending: vi.fn(async () => {
      order.push('cancelPending');
    }),
  };
  const plans = { findByCode: vi.fn() };
  const query = { findSubscription: vi.fn().mockResolvedValue({}) };
  const service = new AdminSubscriptionBillingService(
    subscriptions,
    subscriptionPlans as never,
    requests as never,
    {} as never,
    plans as never,
    {} as never,
    query as never,
  );
  return {
    service,
    lockOrThrow,
    invalidate,
    subscriptionPlans,
    requests,
    plans,
    order,
  };
}

describe('AdminSubscriptionBillingService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('assignPlan', () => {
    const dto = { planCode: 'old', convertRemaining: false, reason: 'support' };

    it('rejects an archived plan that is not the current one', async () => {
      const ctx = setup();
      ctx.plans.findByCode.mockResolvedValue(
        plan({
          id: 'plan-old',
          code: 'old',
          status: BillingPlanStatus.ARCHIVED,
        }),
      );
      ctx.lockOrThrow.mockResolvedValue(subscription('brand-1'));

      const error = await ctx.service
        .assignPlan('brand-1', dto, 'admin-1', NOW)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).errorCode).toBe(
        ErrorCode.BILLING_PLAN_NOT_AVAILABLE.code,
      );
      expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect(ctx.subscriptionPlans.assignPlan).not.toHaveBeenCalled();
      expect(ctx.requests.cancelPending).not.toHaveBeenCalled();
    });

    it('keeps an archived plan that is already the current one, without cancelling the request', async () => {
      const ctx = setup();
      const archived = plan({
        id: 'plan-old',
        code: 'old',
        status: BillingPlanStatus.ARCHIVED,
      });
      ctx.plans.findByCode.mockResolvedValue(archived);
      ctx.lockOrThrow.mockResolvedValue(
        subscription('brand-1', { planId: archived.id, plan: archived }),
      );

      await ctx.service.assignPlan(
        'brand-1',
        { ...dto, customStaffLimit: 7 },
        'admin-1',
        NOW,
      );

      expect(ctx.requests.cancelPending).not.toHaveBeenCalled();
      expect(ctx.subscriptionPlans.assignPlan).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'brand-1' }),
        expect.objectContaining({ plan: archived, customStaffLimit: 7 }),
        { id: 'admin-1', role: BillingActorRole.ADMIN },
        TX,
        NOW,
      );
      expect(ctx.invalidate).toHaveBeenCalledWith('brand-1');
    });

    it('cancels the pending request when the plan changes', async () => {
      const ctx = setup();
      const team = plan({ id: 'plan-team', code: 'team' });
      const current = subscription('brand-1');
      ctx.plans.findByCode.mockResolvedValue(team);
      ctx.lockOrThrow.mockResolvedValue(current);

      await ctx.service.assignPlan(
        'brand-1',
        { ...dto, planCode: 'team' },
        'admin-1',
        NOW,
      );

      expect(ctx.requests.cancelPending).toHaveBeenCalledWith(
        current,
        { id: 'admin-1', role: BillingActorRole.ADMIN },
        'plan_changed',
        TX,
      );
      expect(ctx.order).toEqual(['cancelPending', 'assignPlan']);
    });
  });
});
