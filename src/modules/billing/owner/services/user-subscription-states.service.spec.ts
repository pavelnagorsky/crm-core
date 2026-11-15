import { BusinessRole, SubscriptionPayment, UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../../../auth/dto/token-payload.dto.js';
import { SubscriptionState } from '../../enums/subscription-state.enum.js';
import { SubscriptionWithPlan } from '../../interfaces/subscription-with-plan.interface.js';
import {
  billingSettings,
  EXPIRED,
  NOW,
  payment,
  subscription,
} from '../../testing/owner-billing.fixtures.js';
import { ownerBillingHarness } from '../../testing/owner-billing.harness.js';
import { UserSubscriptionStatesService } from './user-subscription-states.service.js';

function token(
  brandMemberships: TokenPayloadDto['brandMemberships'],
  locationMemberships: TokenPayloadDto['locationMemberships'] = [],
): TokenPayloadDto {
  return {
    sub: 'user-1',
    role: UserRole.USER,
    brandMemberships,
    locationMemberships,
    tokenEpoch: 0,
  };
}

function setup(options: Parameters<typeof ownerBillingHarness>[0] = {}) {
  const h = ownerBillingHarness(options);
  const service = new UserSubscriptionStatesService(
    h.access,
    h.subscriptions,
    h.usage,
    {} as never,
  );
  return { ...h, service };
}

/** Brand states composed from the given subscriptions; usage is 1 staff, 1 location. */
function withStates(
  ctx: ReturnType<typeof setup>,
  byBrand: Record<string, SubscriptionWithPlan | null>,
  pending: Record<string, SubscriptionPayment> = {},
) {
  vi.spyOn(ctx.access, 'state').mockImplementation(async (brandId, now) =>
    ctx.access.compose(
      {
        subscription: byBrand[brandId] ?? null,
        pendingPayment: pending[brandId] ?? null,
      },
      ctx.settings,
      now ?? NOW,
    ),
  );
  vi.spyOn(ctx.usage, 'usageByBrands').mockImplementation(
    async (ids) => new Map(ids.map((id) => [id, { staff: 1, locations: 1 }])),
  );
}

describe('UserSubscriptionStatesService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('states', () => {
    it('omits FREE brands and marks owners by the OWNER role', async () => {
      const ctx = setup();
      withStates(
        ctx,
        {
          'brand-owned': subscription({ brandId: 'brand-owned' }),
          'brand-managed': subscription({ brandId: 'brand-managed' }),
          'brand-staff': subscription({ brandId: 'brand-staff' }),
          'brand-free': null,
        },
        { 'brand-owned': payment({ brandId: 'brand-owned' }) },
      );

      const items = await ctx.service.states(
        token(
          [
            { brandId: 'brand-owned', role: BusinessRole.OWNER },
            { brandId: 'brand-managed', role: BusinessRole.MANAGER },
            { brandId: 'brand-free', role: BusinessRole.OWNER },
          ],
          [
            {
              locationId: 'loc-1',
              brandId: 'brand-staff',
              role: BusinessRole.OWNER,
            },
          ],
        ),
        NOW,
      );

      expect(
        items.map((i) => [i.brandId, i.isOwner, i.hasPendingPayment]),
      ).toEqual([
        ['brand-owned', true, true],
        ['brand-managed', false, false],
        ['brand-staff', false, false],
      ]);
      expect(ctx.usage.usageByBrands).toHaveBeenCalledWith([
        'brand-owned',
        'brand-managed',
        'brand-staff',
      ]);
    });

    it.each([
      ['ACTIVE', {}, true, SubscriptionState.ACTIVE, false],
      [
        'TRIAL',
        { trialEndsAt: new Date('2026-06-30T00:00:00Z') },
        true,
        SubscriptionState.TRIAL,
        false,
      ],
      [
        'PAST_DUE',
        {
          paidUntil: new Date('2026-06-14T00:00:00Z'),
          accessEndsAt: new Date('2026-06-14T00:00:00Z'),
        },
        true,
        SubscriptionState.PAST_DUE,
        false,
      ],
      ['EXPIRED', EXPIRED, true, SubscriptionState.EXPIRED, true],
      [
        'EXPIRED, enforcement off',
        EXPIRED,
        false,
        SubscriptionState.EXPIRED,
        false,
      ],
      [
        'SUSPENDED',
        { suspendedAt: NOW },
        true,
        SubscriptionState.SUSPENDED,
        true,
      ],
      [
        'SUSPENDED, enforcement off',
        { suspendedAt: NOW },
        false,
        SubscriptionState.SUSPENDED,
        false,
      ],
    ] as const)(
      '%s → isBlocked %s',
      async (_label, overrides, enforcementEnabled, state, isBlocked) => {
        const ctx = setup({
          settings: billingSettings({ enforcementEnabled }),
        });
        withStates(ctx, { 'brand-1': subscription(overrides) });

        const [item] = await ctx.service.states(
          token([{ brandId: 'brand-1', role: BusinessRole.OWNER }]),
          NOW,
        );

        expect(item.view.state).toBe(state);
        expect(item.view.isBlocked).toBe(isBlocked);
      },
    );
  });
});
