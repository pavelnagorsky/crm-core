import {
  BillingPeriod,
  BillingPlan,
  Prisma,
  Subscription,
} from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';
import { BillingPeriodCalculator } from './billing-period.calculator.js';
import { PricingCountryResolver } from './pricing-country.resolver.js';

type ConvertedSubscription = Pick<
  Subscription,
  'timezone' | 'trialEndsAt' | 'paidUntil'
>;

/** Pure rule of plan section 4.4: the paid remainder becomes days of the new plan. */
export class PlanConversionCalculator {
  private constructor() {}

  /** Start of the paid remainder; the rest of the trial is never converted. */
  static paidFrom(subscription: ConvertedSubscription, now: Date): Date {
    return subscription.trialEndsAt > now ? subscription.trialEndsAt : now;
  }

  static hasPaidRemainder(
    subscription: ConvertedSubscription,
    now: Date,
  ): boolean {
    return (
      subscription.paidUntil !== null &&
      subscription.paidUntil >
        PlanConversionCalculator.paidFrom(subscription, now)
    );
  }

  /**
   * newPaidUntil = paidFrom + remaining × oldPrice / newPrice, rounded to the
   * nearest local midnight (half a day rounds up), at least one day after paidFrom.
   * Both prices are for the same billing period, so the period length cancels out.
   */
  static convert(
    subscription: ConvertedSubscription,
    oldPrice: Prisma.Decimal,
    newPrice: Prisma.Decimal,
    now: Date,
  ): Date {
    const paidFrom = PlanConversionCalculator.paidFrom(subscription, now);
    const paidUntil = subscription.paidUntil;
    if (!paidUntil || paidUntil <= paidFrom || newPrice.lte(0))
      throw new RangeError('No paid remainder to convert');

    const remainingMs = new Prisma.Decimal(
      paidUntil.getTime() - paidFrom.getTime(),
    );
    const convertedMs = remainingMs.mul(oldPrice).div(newPrice).round();
    const raw = new Date(paidFrom.getTime() + convertedMs.toNumber());

    const tz = subscription.timezone;
    const floor = BillingPeriodCalculator.dayStart(raw, tz);
    const ceil = TimeUtils.addDaysInTz(floor, 1, tz);
    const rounded =
      raw.getTime() - floor.getTime() >= (ceil.getTime() - floor.getTime()) / 2
        ? ceil
        : floor;
    const minimum = TimeUtils.addDaysInTz(
      BillingPeriodCalculator.dayStart(paidFrom, tz),
      1,
      tz,
    );
    return rounded < minimum ? minimum : rounded;
  }

  /**
   * The remainder in days of the new plan, priced for the current billing period.
   * `newTerms` are the subscription terms after the change (custom prices of the
   * new plan). Null when either price is missing.
   */
  static convertedPaidUntil(
    subscription: SubscriptionWithPlan,
    newPlan: BillingPlan,
    newTerms: Subscription,
    plans: readonly BillingPlanWithPrices[],
    defaultCountryCode: string,
    now: Date,
  ): Date | null {
    if (!subscription.plan) return null;
    const period = subscription.billingPeriod ?? BillingPeriod.MONTH;
    const price = (terms: Subscription, plan: BillingPlan) =>
      PricingCountryResolver.subscriptionPrice(
        terms,
        plan,
        period,
        plans,
        defaultCountryCode,
        now,
      );
    const oldPrice = price(subscription, subscription.plan);
    const newPrice = price(newTerms, newPlan);
    if (!oldPrice || !newPrice || newPrice.amount.lte(0)) return null;
    return PlanConversionCalculator.convert(
      subscription,
      oldPrice.amount,
      newPrice.amount,
      now,
    );
  }
}
