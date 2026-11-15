import {
  BillingPeriod,
  BillingPlan,
  BillingPlanPrice,
  BillingPlanPricingMode,
  Subscription,
} from '@prisma/client';
import { countryDefault } from '../../../shared/geo/country-defaults.js';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';
import { PlanPeriodPrices } from '../interfaces/plan-period-prices.interface.js';
import { PricingCatalog } from '../interfaces/pricing-catalog.interface.js';
import { ResolvedPlanPricing } from '../interfaces/resolved-plan-pricing.interface.js';
import { SubscriptionPrice } from '../interfaces/subscription-price.interface.js';

type PricedSubscription = Pick<
  Subscription,
  | 'countryCode'
  | 'planId'
  | 'customCurrency'
  | 'customMonthlyPrice'
  | 'customYearlyPrice'
>;

const FALLBACK_CURRENCY = 'BYN';

/** Pure rules of plan section 2.3: one country per answer, currencies never mix. */
export class PricingCountryResolver {
  private constructor() {}

  /** Latest version with effectiveFrom <= now, or null. */
  static currentPrice(
    prices: readonly BillingPlanPrice[],
    countryCode: string,
    period: BillingPeriod,
    now: Date,
  ): BillingPlanPrice | null {
    let current: BillingPlanPrice | null = null;
    for (const price of prices) {
      if (
        price.countryCode !== countryCode ||
        price.billingPeriod !== period ||
        price.effectiveFrom > now
      )
        continue;
      if (!current || price.effectiveFrom > current.effectiveFrom)
        current = price;
    }
    return current;
  }

  static periodPrices(
    plan: BillingPlanWithPrices,
    countryCode: string,
    now: Date,
  ): PlanPeriodPrices | null {
    const prices = {
      MONTH: PricingCountryResolver.currentPrice(
        plan.prices,
        countryCode,
        BillingPeriod.MONTH,
        now,
      ),
      YEAR: PricingCountryResolver.currentPrice(
        plan.prices,
        countryCode,
        BillingPeriod.YEAR,
        now,
      ),
    };
    return prices.MONTH || prices.YEAR ? prices : null;
  }

  static hasCurrentPrices(
    plans: readonly BillingPlanWithPrices[],
    countryCode: string,
    now: Date,
  ): boolean {
    return plans.some((plan) =>
      plan.prices.some(
        (price) =>
          price.countryCode === countryCode && price.effectiveFrom <= now,
      ),
    );
  }

  static pricingCountry(
    plans: readonly BillingPlanWithPrices[],
    countryCode: string,
    defaultCountryCode: string,
    now: Date,
  ): string {
    return PricingCountryResolver.hasCurrentPrices(plans, countryCode, now)
      ? countryCode
      : defaultCountryCode;
  }

  /** One currency per country: from its prices, else the country default. */
  static currency(
    plans: readonly BillingPlanWithPrices[],
    countryCode: string,
  ): string {
    for (const plan of plans)
      for (const price of plan.prices)
        if (price.countryCode === countryCode) return price.currency;
    return countryDefault(countryCode)?.currency ?? FALLBACK_CURRENCY;
  }

  /** Future price versions, soonest first; of one country when it is given. */
  static upcoming(
    prices: readonly BillingPlanPrice[],
    now: Date,
    countryCode?: string,
  ): BillingPlanPrice[] {
    return prices
      .filter(
        (price) =>
          price.effectiveFrom > now &&
          (countryCode === undefined || price.countryCode === countryCode),
      )
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  }

  /** Prices of every given plan in the pricing country of `countryCode`. */
  static catalog(
    plans: readonly BillingPlanWithPrices[],
    countryCode: string,
    defaultCountryCode: string,
    now: Date,
  ): PricingCatalog {
    const pricingCountry = PricingCountryResolver.pricingCountry(
      plans,
      countryCode,
      defaultCountryCode,
      now,
    );
    return {
      country: countryCode,
      pricingCountry,
      currency: PricingCountryResolver.currency(plans, pricingCountry),
      plans: plans.map((plan): ResolvedPlanPricing => ({
        plan,
        prices: PricingCountryResolver.periodPrices(plan, pricingCountry, now),
        upcoming: PricingCountryResolver.upcoming(
          plan.prices,
          now,
          pricingCountry,
        ),
      })),
    };
  }

  /**
   * Price of a plan for a subscription today. A CUSTOM plan has a price only on the
   * subscription it is assigned to; a STANDARD plan uses the pricing country.
   */
  static subscriptionPrice(
    subscription: PricedSubscription,
    plan: Pick<BillingPlan, 'id' | 'pricingMode'>,
    period: BillingPeriod,
    plans: readonly BillingPlanWithPrices[],
    defaultCountryCode: string,
    now: Date,
  ): SubscriptionPrice | null {
    const pricingCountry = PricingCountryResolver.pricingCountry(
      plans,
      subscription.countryCode,
      defaultCountryCode,
      now,
    );
    if (plan.pricingMode === BillingPlanPricingMode.CUSTOM) {
      if (subscription.planId !== plan.id) return null;
      const amount =
        period === BillingPeriod.YEAR
          ? subscription.customYearlyPrice
          : subscription.customMonthlyPrice;
      if (!amount) return null;
      return {
        countryCode: pricingCountry,
        currency:
          subscription.customCurrency ??
          PricingCountryResolver.currency(plans, pricingCountry),
        amount,
      };
    }
    const withPrices = plans.find((p) => p.id === plan.id);
    const price = withPrices
      ? PricingCountryResolver.currentPrice(
          withPrices.prices,
          pricingCountry,
          period,
          now,
        )
      : null;
    return price
      ? {
          countryCode: pricingCountry,
          currency: price.currency,
          amount: price.amount,
        }
      : null;
  }
}
