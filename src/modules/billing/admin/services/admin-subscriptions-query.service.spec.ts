import { AdminSubscriptionsRequestDto } from '../../dto/admin-subscriptions-request.dto.js';
import { SubscriptionState } from '../../enums/subscription-state.enum.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';
import {
  NOW,
  SETTINGS,
  SOLO,
  subscription,
} from '../../testing/admin-billing.fixtures.js';
import { AdminSubscriptionAssessor } from './admin-subscription-assessor.service.js';
import { AdminSubscriptionFilter } from './admin-subscription-filter.service.js';
import { AdminSubscriptionsQueryService } from './admin-subscriptions-query.service.js';

const ACTIVE = {};
const EXPIRED = {
  paidUntil: new Date('2026-05-01T00:00:00Z'),
  accessEndsAt: new Date('2026-05-01T00:00:00Z'),
};
const TRIAL = { trialEndsAt: new Date('2026-06-30T00:00:00Z') };

function request(
  overrides: Partial<AdminSubscriptionsRequestDto> = {},
): AdminSubscriptionsRequestDto {
  return {
    page: 1,
    pageSize: 25,
    ...overrides,
  } as AdminSubscriptionsRequestDto;
}

/** The query service with the real filter and assessor over mocked data services. */
function setup(
  rows: SubscriptionWithPlan[] = [],
  usage: Record<string, { staff: number; locations: number }> = {},
) {
  const subscriptions = {
    search: vi.fn().mockResolvedValue({ items: rows, totalItems: rows.length }),
  };
  const payments = {
    findBrandIdsWithPending: vi.fn().mockResolvedValue(new Set<string>()),
  };
  const plans = { findAllCached: vi.fn().mockResolvedValue([SOLO]) };
  const settings = { get: vi.fn().mockResolvedValue(SETTINGS) };
  const access = new SubscriptionAccessService(
    {} as never,
    settings as never,
    plans as never,
    {} as never,
    {} as never,
  );
  const billingUsage = {
    usageByBrands: vi.fn(
      async (ids: string[]) =>
        new Map(ids.map((id) => [id, usage[id] ?? { staff: 1, locations: 1 }])),
    ),
  };
  const brands = {
    findIdsByName: vi.fn().mockResolvedValue([]),
    findNames: vi.fn(
      async (ids: string[]) => new Map(ids.map((id) => [id, `Brand ${id}`])),
    ),
    findActiveIds: vi.fn(async (ids: string[]) => new Set(ids)),
  };
  const accessService = {
    findBrandIdsOwnedBy: vi.fn().mockResolvedValue([]),
    findOwnerIdsByBrands: vi.fn().mockResolvedValue(new Map()),
  };
  const users = {
    findIdsByEmail: vi.fn().mockResolvedValue([]),
    findAccessParticipants: vi.fn().mockResolvedValue([]),
  };
  const filter = new AdminSubscriptionFilter(
    brands as never,
    users as never,
    accessService as never,
  );
  const assessor = new AdminSubscriptionAssessor(
    access,
    payments as never,
    settings as never,
    billingUsage as never,
    brands as never,
    accessService as never,
    users as never,
  );
  const service = new AdminSubscriptionsQueryService(
    subscriptions as never,
    payments as never,
    {} as never,
    plans as never,
    settings as never,
    filter,
    assessor,
  );
  return { service, subscriptions, brands, users, accessService };
}

describe('AdminSubscriptionsQueryService', () => {
  describe('search', () => {
    it('returns nothing without querying subscriptions when the search matches no brand', async () => {
      const ctx = setup([subscription('brand-1')]);

      const result = await ctx.service.search(
        request({ search: 'nobody' }),
        NOW,
      );

      expect(result).toEqual({ items: [], totalItems: 0 });
      expect(ctx.brands.findIdsByName).toHaveBeenCalledWith(
        'nobody',
        expect.any(Number),
      );
      expect(ctx.users.findIdsByEmail).toHaveBeenCalledWith(
        'nobody',
        expect.any(Number),
      );
      expect(ctx.subscriptions.search).not.toHaveBeenCalled();
    });

    it('searches by brand name and owner email together', async () => {
      const ctx = setup([subscription('brand-1')]);
      ctx.brands.findIdsByName.mockResolvedValue(['brand-1']);
      ctx.users.findIdsByEmail.mockResolvedValue(['user-9']);
      ctx.accessService.findBrandIdsOwnedBy.mockResolvedValue([
        'brand-2',
        'brand-1',
      ]);

      await ctx.service.search(request({ search: 'x' }), NOW);

      expect(ctx.accessService.findBrandIdsOwnedBy).toHaveBeenCalledWith([
        'user-9',
      ]);
      expect(ctx.subscriptions.search.mock.calls[0][0]).toEqual({
        AND: [{ brandId: { in: ['brand-1', 'brand-2'] } }],
      });
    });

    it('pages in SQL when no computed filter is set', async () => {
      const ctx = setup([subscription('brand-1')]);

      await ctx.service.search(request({ page: 3, pageSize: 10 }), NOW);

      expect(ctx.subscriptions.search.mock.calls[0][3]).toEqual({
        skip: 20,
        take: 10,
      });
    });

    it('filters by state in memory with the matched total and the page', async () => {
      const ctx = setup([
        subscription('a', ACTIVE),
        subscription('b', EXPIRED),
        subscription('c', EXPIRED),
        subscription('d', TRIAL),
        subscription('e', EXPIRED),
      ]);

      const result = await ctx.service.search(
        request({ page: 2, pageSize: 2, state: [SubscriptionState.EXPIRED] }),
        NOW,
      );

      expect(ctx.subscriptions.search.mock.calls[0][3]).toEqual({});
      expect(result.totalItems).toBe(3);
      expect(result.items.map((i) => i.subscription.brandId)).toEqual(['e']);
      expect(result.items[0].view.state).toBe(SubscriptionState.EXPIRED);
    });

    it('filters by overLimit in memory; a trial is never over the limit', async () => {
      const rows = [
        subscription('a', ACTIVE),
        subscription('b', ACTIVE),
        subscription('c', TRIAL),
        subscription('d', ACTIVE),
      ];
      const usage = {
        a: { staff: 5, locations: 1 },
        c: { staff: 5, locations: 1 },
        d: { staff: 5, locations: 1 },
      };

      const over = await setup(rows, usage).service.search(
        request({ page: 1, pageSize: 1, overLimit: true }),
        NOW,
      );
      expect(over.totalItems).toBe(2);
      expect(over.items.map((i) => i.subscription.brandId)).toEqual(['a']);

      const within = await setup(rows, usage).service.search(
        request({ overLimit: false }),
        NOW,
      );
      expect(within.totalItems).toBe(2);
      expect(within.items.map((i) => i.subscription.brandId)).toEqual([
        'b',
        'c',
      ]);
    });

    it('returns every match of a computed filter on export', async () => {
      const ctx = setup([
        subscription('a', EXPIRED),
        subscription('b', EXPIRED),
      ]);

      const result = await ctx.service.search(
        request({
          pageSize: 1,
          isExport: true,
          state: [SubscriptionState.EXPIRED],
        }),
        NOW,
      );

      expect(result.items).toHaveLength(2);
      expect(result.totalItems).toBe(2);
    });
  });
});
