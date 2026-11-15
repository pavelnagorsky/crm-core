import { BillingPlanWithPrices } from './billing-plan-with-prices.interface.js';
import { BillingUsage } from './billing-usage.interface.js';
import { BrandBillingState } from './brand-billing-state.interface.js';
import { SubscriptionWithPlan } from './subscription-with-plan.interface.js';

/** What an owner quote is computed from: a started subscription, its usage and the plans. */
export interface BrandQuoteContext {
  state: BrandBillingState;
  subscription: SubscriptionWithPlan;
  usage: BillingUsage;
  plans: readonly BillingPlanWithPrices[];
}
