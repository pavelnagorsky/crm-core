import {
  BillingPlan,
  BillingPlanPricingMode,
  BillingPlanStatus,
  Subscription,
} from '@prisma/client';
import { BillingUsage } from '../interfaces/billing-usage.interface.js';
import { EffectiveLimits } from '../interfaces/effective-limits.interface.js';
import { UsageExceedsPayload } from '../interfaces/usage-exceeds-payload.interface.js';

type PlanLimits = Pick<BillingPlan, 'staffLimit' | 'locationLimit'>;

type LimitedSubscription = Pick<
  Subscription,
  'customStaffLimit' | 'customLocationLimit'
> & { plan: PlanLimits | null };

/** Pure rule of plan section 5.2: custom limit, else none without a plan, else the plan. */
export class EffectiveLimitsCalculator {
  private constructor() {}

  static unlimited(): EffectiveLimits {
    return { staff: null, locations: null };
  }

  static compute(subscription: LimitedSubscription | null): EffectiveLimits {
    if (!subscription) return EffectiveLimitsCalculator.unlimited();
    const plan = subscription.plan;
    return {
      staff: subscription.customStaffLimit ?? plan?.staffLimit ?? null,
      locations:
        subscription.customLocationLimit ?? plan?.locationLimit ?? null,
    };
  }

  static ofPlan(plan: PlanLimits): EffectiveLimits {
    return { staff: plan.staffLimit, locations: plan.locationLimit };
  }

  static fitsLimit(limit: number | null, used: number): boolean {
    return limit === null || used <= limit;
  }

  static fits(limits: EffectiveLimits, usage: BillingUsage): boolean {
    return (
      EffectiveLimitsCalculator.fitsLimit(limits.staff, usage.staff) &&
      EffectiveLimitsCalculator.fitsLimit(limits.locations, usage.locations)
    );
  }

  static isOverLimit(limits: EffectiveLimits, usage: BillingUsage): boolean {
    return !EffectiveLimitsCalculator.fits(limits, usage);
  }

  static exceedsPayload(
    limits: EffectiveLimits,
    usage: BillingUsage,
  ): UsageExceedsPayload {
    return {
      staff: { limit: limits.staff, used: usage.staff },
      locations: { limit: limits.locations, used: usage.locations },
    };
  }

  /** A plan the owner can buy by themselves. */
  static isSelfServe(
    plan: Pick<BillingPlan, 'status' | 'isPublic' | 'pricingMode'>,
  ): boolean {
    return (
      plan.status === BillingPlanStatus.ACTIVE &&
      plan.isPublic &&
      plan.pricingMode === BillingPlanPricingMode.STANDARD
    );
  }

  /**
   * First plan by position that fits the usage. `plans` must already be the
   * self-serve plans with a current price; null means a custom plan is needed.
   */
  static suggestedPlan<T extends PlanLimits & Pick<BillingPlan, 'position'>>(
    plans: readonly T[],
    usage: BillingUsage,
  ): T | null {
    return (
      [...plans]
        .sort((a, b) => a.position - b.position)
        .find((plan) =>
          EffectiveLimitsCalculator.fits(
            EffectiveLimitsCalculator.ofPlan(plan),
            usage,
          ),
        ) ?? null
    );
  }

  /** No self-serve plan fits the usage and the brand is not on custom terms yet. */
  static needsCustomPlan(
    plan: Pick<BillingPlan, 'pricingMode'> | null,
    selfServePlans: readonly (PlanLimits & Pick<BillingPlan, 'position'>)[],
    usage: BillingUsage,
  ): boolean {
    return (
      plan?.pricingMode !== BillingPlanPricingMode.CUSTOM &&
      !EffectiveLimitsCalculator.suggestedPlan(selfServePlans, usage)
    );
  }
}
