import { BillingPlanPricingMode, BillingPlanStatus } from '@prisma/client';
import { EffectiveLimitsCalculator } from './effective-limits.calculator.js';

const masterLimits = { staffLimit: 1, locationLimit: 1 };

const sub = (
  plan: { staffLimit: number | null; locationLimit: number | null } | null,
  customStaffLimit: number | null = null,
  customLocationLimit: number | null = null,
) => ({ plan, customStaffLimit, customLocationLimit });

describe('EffectiveLimitsCalculator (plan 5.2)', () => {
  describe('compute', () => {
    it('no subscription row (FREE) has no limits', () => {
      expect(EffectiveLimitsCalculator.compute(null)).toEqual({
        staff: null,
        locations: null,
      });
    });

    it('custom limit wins over the plan', () => {
      expect(
        EffectiveLimitsCalculator.compute(sub(masterLimits, 5, 2)),
      ).toEqual({
        staff: 5,
        locations: 2,
      });
    });

    it('custom limit applies even without a plan, and per resource', () => {
      expect(EffectiveLimitsCalculator.compute(sub(null, 4, null))).toEqual({
        staff: 4,
        locations: null,
      });
      expect(
        EffectiveLimitsCalculator.compute(sub(masterLimits, null, 3)),
      ).toEqual({
        staff: 1,
        locations: 3,
      });
    });

    it('a custom limit of 0 is a limit, not "unset"', () => {
      expect(
        EffectiveLimitsCalculator.compute(sub(masterLimits, 0, 0)),
      ).toEqual({
        staff: 0,
        locations: 0,
      });
    });

    it('no plan chosen (trial, grace after it) → no limits', () => {
      expect(EffectiveLimitsCalculator.compute(sub(null))).toEqual({
        staff: null,
        locations: null,
      });
    });

    it('otherwise the plan limits; null in the plan is unlimited', () => {
      expect(EffectiveLimitsCalculator.compute(sub(masterLimits))).toEqual({
        staff: 1,
        locations: 1,
      });
      expect(
        EffectiveLimitsCalculator.compute(
          sub({ staffLimit: 5, locationLimit: null }),
        ),
      ).toEqual({ staff: 5, locations: null });
    });
  });

  describe('fits / isOverLimit', () => {
    it('null is unlimited, the limit itself still fits', () => {
      expect(EffectiveLimitsCalculator.fitsLimit(null, 1000)).toBe(true);
      expect(EffectiveLimitsCalculator.fitsLimit(1, 1)).toBe(true);
      expect(EffectiveLimitsCalculator.fitsLimit(1, 2)).toBe(false);
    });

    it('is over the limit when any resource exceeds it', () => {
      const limits = { staff: 1, locations: 1 };
      expect(
        EffectiveLimitsCalculator.isOverLimit(limits, {
          staff: 1,
          locations: 1,
        }),
      ).toBe(false);
      expect(
        EffectiveLimitsCalculator.isOverLimit(limits, {
          staff: 3,
          locations: 1,
        }),
      ).toBe(true);
      expect(
        EffectiveLimitsCalculator.isOverLimit(limits, {
          staff: 1,
          locations: 2,
        }),
      ).toBe(true);
    });

    it('exceedsPayload reports limit and usage per resource', () => {
      expect(
        EffectiveLimitsCalculator.exceedsPayload(
          { staff: 1, locations: null },
          { staff: 3, locations: 2 },
        ),
      ).toEqual({
        staff: { limit: 1, used: 3 },
        locations: { limit: null, used: 2 },
      });
    });
  });

  describe('suggestedPlan (plan 5.3)', () => {
    const master = {
      code: 'master',
      position: 1,
      staffLimit: 1,
      locationLimit: 1,
    };
    const team = { code: 'team', position: 2, staffLimit: 5, locationLimit: 1 };
    const plans = [team, master];

    it('picks the first plan by position that fits', () => {
      expect(
        EffectiveLimitsCalculator.suggestedPlan(plans, {
          staff: 1,
          locations: 1,
        }),
      ).toBe(master);
      expect(
        EffectiveLimitsCalculator.suggestedPlan(plans, {
          staff: 2,
          locations: 1,
        }),
      ).toBe(team);
    });

    it('is null when only a custom plan fits', () => {
      expect(
        EffectiveLimitsCalculator.suggestedPlan(plans, {
          staff: 6,
          locations: 1,
        }),
      ).toBeNull();
      expect(
        EffectiveLimitsCalculator.suggestedPlan(plans, {
          staff: 1,
          locations: 2,
        }),
      ).toBeNull();
    });
  });

  describe('isSelfServe', () => {
    const base = {
      status: BillingPlanStatus.ACTIVE,
      isPublic: true,
      pricingMode: BillingPlanPricingMode.STANDARD,
    };

    it('only ACTIVE, public, STANDARD plans', () => {
      expect(EffectiveLimitsCalculator.isSelfServe(base)).toBe(true);
      expect(
        EffectiveLimitsCalculator.isSelfServe({ ...base, isPublic: false }),
      ).toBe(false);
      expect(
        EffectiveLimitsCalculator.isSelfServe({
          ...base,
          pricingMode: BillingPlanPricingMode.CUSTOM,
        }),
      ).toBe(false);
      for (const status of Object.values(BillingPlanStatus).filter(
        (s) => s !== BillingPlanStatus.ACTIVE,
      ))
        expect(EffectiveLimitsCalculator.isSelfServe({ ...base, status })).toBe(
          false,
        );
    });
  });
});
