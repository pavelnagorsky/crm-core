import { ResolvedPlanPricing } from './resolved-plan-pricing.interface.js';

export interface PricingCatalog {
  /** Requested country. */
  country: string;
  /** Country whose prices apply: the requested one if it has prices, else the default. */
  pricingCountry: string;
  currency: string;
  plans: ResolvedPlanPricing[];
}
