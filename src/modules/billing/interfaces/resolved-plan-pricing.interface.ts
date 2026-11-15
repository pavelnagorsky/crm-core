import { BillingPlanPrice } from '@prisma/client';
import { BillingPlanWithPrices } from './billing-plan-with-prices.interface.js';
import { PlanPeriodPrices } from './plan-period-prices.interface.js';

export interface ResolvedPlanPricing {
  plan: BillingPlanWithPrices;
  /** null when the plan has no current price in the pricing country. */
  prices: PlanPeriodPrices | null;
  /** Future versions in the pricing country, soonest first. */
  upcoming: BillingPlanPrice[];
}
