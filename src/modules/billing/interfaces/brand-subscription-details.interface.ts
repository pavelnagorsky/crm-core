import { BillingUsage } from './billing-usage.interface.js';
import { BrandBillingState } from './brand-billing-state.interface.js';

/** Owner subscription screen (plan section 8.2). */
export interface BrandSubscriptionDetails extends BrandBillingState {
  /** Country whose prices apply to this subscription. */
  pricingCountry: string;
  currency: string;
  usage: BillingUsage;
  /** Usage is above the limits that apply now (plan section 5.4). */
  overLimit: boolean;
  /** No standard plan fits the usage and no custom plan is assigned. */
  needsCustomPlan: boolean;
}
