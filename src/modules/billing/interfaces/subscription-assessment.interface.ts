import { BillingUsage } from './billing-usage.interface.js';
import { EffectiveLimits } from './effective-limits.interface.js';
import { SubscriptionStateView } from './subscription-state-view.interface.js';

/** What the state and the usage say about one subscription. */
export interface SubscriptionAssessment {
  view: SubscriptionStateView;
  limits: EffectiveLimits;
  usage: BillingUsage;
  overLimit: boolean;
  needsCustomPlan: boolean;
}
