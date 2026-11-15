import { plan, subscription } from '../../testing/admin-billing.fixtures.js';
import { AdminBillingPlansService } from './admin-billing-plans.service.js';

function setup(
  usage: Record<string, { staff: number; locations: number }> = {},
) {
  const plans = { update: vi.fn() };
  const subscriptions = { findManyByPlan: vi.fn() };
  const billingUsage = {
    usageByBrands: vi.fn(
      async (ids: string[]) =>
        new Map(ids.map((id) => [id, usage[id] ?? { staff: 1, locations: 1 }])),
    ),
  };
  const service = new AdminBillingPlansService(
    plans as never,
    subscriptions as never,
    {} as never,
    billingUsage as never,
  );
  return { service, plans, subscriptions };
}

describe('AdminBillingPlansService', () => {
  describe('update', () => {
    it('counts the subscriptions the new limits put over the limit', async () => {
      const ctx = setup({
        a: { staff: 5, locations: 1 },
        b: { staff: 5, locations: 1 },
        c: { staff: 1, locations: 1 },
      });
      const updated = plan({ staffLimit: 2 });
      ctx.plans.update.mockResolvedValue(updated);
      ctx.subscriptions.findManyByPlan.mockResolvedValue([
        subscription('a', { customStaffLimit: 10 }),
        subscription('b'),
        subscription('c'),
      ]);

      const result = await ctx.service.update(
        'plan-solo',
        { staffLimit: 2 },
        'admin-1',
      );

      expect(ctx.plans.update).toHaveBeenCalledWith(
        'plan-solo',
        { staffLimit: 2 },
        'admin-1',
      );
      expect(ctx.subscriptions.findManyByPlan).toHaveBeenCalledWith(
        'plan-solo',
      );
      expect(result.overLimitSubscriptions).toBe(1);
      expect(result.subscriptions).toBe(3);
      expect(result.plan).toBe(updated);
    });
  });
});
