import { BillingUsage } from './billing-usage.interface.js';
import { EffectiveLimits } from './effective-limits.interface.js';
import { SubscriptionStateView } from './subscription-state-view.interface.js';
import { SubscriptionWithPlan } from './subscription-with-plan.interface.js';

/** A row of the admin subscription list. */
export interface AdminSubscriptionItem {
  subscription: SubscriptionWithPlan;
  brandName: string | null;
  /** The brand is soft-deleted; its subscription stays for history. */
  brandDeleted: boolean;
  ownerEmails: string[];
  view: SubscriptionStateView;
  limits: EffectiveLimits;
  usage: BillingUsage;
  overLimit: boolean;
  needsCustomPlan: boolean;
  hasPendingPayment: boolean;
}
