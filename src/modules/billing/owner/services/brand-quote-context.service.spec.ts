import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import {
  NOW,
  PLANS,
  rejection,
  subscription,
} from '../../testing/owner-billing.fixtures.js';
import { ownerBillingHarness } from '../../testing/owner-billing.harness.js';
import { BrandQuoteContextService } from './brand-quote-context.service.js';

function setup(current: SubscriptionWithPlan | null) {
  const h = ownerBillingHarness();
  vi.spyOn(h.access, 'state').mockImplementation(async (_brandId, now) =>
    h.access.compose(
      { subscription: current, pendingPayment: null },
      h.settings,
      now ?? NOW,
    ),
  );
  const service = new BrandQuoteContextService(
    h.access,
    h.usage,
    h.plans as never,
  );
  return { ...h, service };
}

describe('BrandQuoteContextService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects a FREE brand with SUBSCRIPTION_NOT_STARTED', async () => {
    const { service } = setup(null);

    const error = await rejection(service.load('brand-1', NOW));

    expect(error.errorCode).toBe(ErrorCode.SUBSCRIPTION_NOT_STARTED.code);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('returns the subscription with its state, usage and plans', async () => {
    const current = subscription();
    const { service } = setup(current);

    const context = await service.load('brand-1', NOW);

    expect(context.subscription).toBe(current);
    expect(context.state.snapshot.subscription).toBe(current);
    expect(context.usage).toEqual({ staff: 1, locations: 1 });
    expect(context.plans).toBe(PLANS);
  });
});
