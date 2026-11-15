import { HttpStatus } from '@nestjs/common';
import {
  BillingPlan,
  BillingPlanPricingMode,
  BillingPlanStatus,
} from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { BillingFacade } from './billing.facade.js';
import { UsageResource } from './enums/usage-resource.enum.js';
import { SubscriptionWithPlan } from './interfaces/subscription-with-plan.interface.js';
import { SubscriptionAccessService } from './subscriptions/services/subscription-access.service.js';

const NOW = new Date('2026-06-15T12:00:00Z');
const TX = {} as never;

function plan(overrides: Partial<BillingPlan> = {}): BillingPlan {
  return {
    id: 'plan-solo',
    code: 'solo',
    name: 'Solo',
    position: 1,
    status: BillingPlanStatus.ACTIVE,
    isPublic: true,
    pricingMode: BillingPlanPricingMode.STANDARD,
    staffLimit: 2,
    locationLimit: 1,
    createdAt: NOW,
    updatedAt: NOW,
    updatedById: null,
    ...overrides,
  };
}

/** ACTIVE: the trial ended, access runs until July. */
function subscription(
  overrides: Partial<SubscriptionWithPlan> = {},
): SubscriptionWithPlan {
  return {
    id: 'sub-1',
    brandId: 'brand-1',
    countryCode: 'BY',
    timezone: 'Europe/Minsk',
    planId: 'plan-solo',
    billingPeriod: 'MONTH',
    billingAnchorDay: 1,
    trialStartedAt: new Date('2026-04-01T00:00:00Z'),
    trialEndsAt: new Date('2026-05-01T00:00:00Z'),
    trialUserId: 'user-1',
    paidUntil: new Date('2026-07-01T00:00:00Z'),
    accessEndsAt: new Date('2026-07-01T00:00:00Z'),
    graceExtendedUntil: null,
    graceExtendedFor: null,
    customStaffLimit: null,
    customLocationLimit: null,
    customCurrency: null,
    customMonthlyPrice: null,
    customYearlyPrice: null,
    suspendedAt: null,
    suspendReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    plan: plan(),
    ...overrides,
  };
}

function setup(options: {
  enforcementEnabled?: boolean;
  subscription?: SubscriptionWithPlan | null;
  selfServe?: BillingPlan[];
}) {
  const order: string[] = [];
  const settings = {
    get: vi.fn().mockResolvedValue({
      enforcementEnabled: options.enforcementEnabled ?? true,
      graceDays: 3,
    }),
  };
  const subscriptions = {
    lock: vi.fn().mockImplementation(async () => {
      order.push('lock');
      return options.subscription === undefined
        ? subscription()
        : options.subscription;
    }),
  };
  const access = {
    selfServePlans: vi.fn().mockResolvedValue(options.selfServe ?? []),
    limits: SubscriptionAccessService.prototype.limits,
  };
  const facade = new BillingFacade(
    settings as never,
    subscriptions as never,
    {} as never,
    {} as never,
    access as never,
  );
  const count = (used: number) =>
    vi.fn().mockImplementation(async () => {
      order.push('count');
      return used;
    });
  return { facade, settings, subscriptions, access, count, order };
}

describe('BillingFacade.assertUsageIncreaseAllowed', () => {
  it('does nothing while enforcement is off', async () => {
    const { facade, subscriptions, count } = setup({
      enforcementEnabled: false,
    });
    const used = count(100);

    await expect(
      facade.assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.STAFF,
        used,
        TX,
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(subscriptions.lock).not.toHaveBeenCalled();
    expect(used).not.toHaveBeenCalled();
  });

  it('does not limit a FREE brand (no subscription)', async () => {
    const { facade, count } = setup({ subscription: null });
    const used = count(100);

    await expect(
      facade.assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.STAFF,
        used,
        TX,
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(used).not.toHaveBeenCalled();
  });

  it('does not limit a TRIAL brand even with a paid plan', async () => {
    const { facade, count } = setup({
      subscription: subscription({
        trialEndsAt: new Date('2026-06-30T00:00:00Z'),
      }),
    });
    const used = count(100);

    await expect(
      facade.assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.STAFF,
        used,
        TX,
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(used).not.toHaveBeenCalled();
  });

  it('allows the increase below the limit', async () => {
    const { facade, count } = setup({});

    await expect(
      facade.assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.STAFF,
        count(1),
        TX,
        NOW,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects at the staff limit with the limit payload and a suggested plan', async () => {
    const team = plan({
      id: 'plan-team',
      code: 'team',
      position: 2,
      staffLimit: 10,
    });
    const { facade, count } = setup({ selfServe: [plan(), team] });

    const error = await facade
      .assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.STAFF,
        count(2),
        TX,
        NOW,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect((error as AppException).errorCode).toBe(
      ErrorCode.PLAN_STAFF_LIMIT_REACHED.code,
    );
    expect((error as AppException).payload).toEqual({
      resource: UsageResource.STAFF,
      limit: 2,
      used: 2,
      planCode: 'solo',
      suggestedPlanCode: 'team',
    });
  });

  it('suggests no plan when no self-serve plan fits', async () => {
    const { facade, count } = setup({ selfServe: [plan()] });

    const error = await facade
      .assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.STAFF,
        count(2),
        TX,
        NOW,
      )
      .catch((e: unknown) => e);

    expect((error as AppException).payload).toMatchObject({
      suggestedPlanCode: null,
    });
  });

  it('uses the custom limit and the location error for locations', async () => {
    const { facade, count } = setup({
      subscription: subscription({ customLocationLimit: 3 }),
    });

    const error = await facade
      .assertUsageIncreaseAllowed(
        'brand-1',
        UsageResource.LOCATION,
        count(3),
        TX,
        NOW,
      )
      .catch((e: unknown) => e);

    expect((error as AppException).errorCode).toBe(
      ErrorCode.PLAN_LOCATION_LIMIT_REACHED.code,
    );
    expect((error as AppException).payload).toMatchObject({
      limit: 3,
      used: 3,
    });
  });

  it('locks the subscription row before counting', async () => {
    const { facade, subscriptions, count, order } = setup({});

    await facade.assertUsageIncreaseAllowed(
      'brand-1',
      UsageResource.STAFF,
      count(0),
      TX,
      NOW,
    );

    expect(subscriptions.lock).toHaveBeenCalledWith('brand-1', TX);
    expect(order).toEqual(['lock', 'count']);
  });
});
