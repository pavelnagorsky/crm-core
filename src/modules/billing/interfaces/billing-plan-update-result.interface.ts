import { AdminBillingPlan } from './admin-billing-plan.interface.js';

export interface BillingPlanUpdateResult extends AdminBillingPlan {
  /** Subscriptions on this plan whose usage is above the new limits. */
  overLimitSubscriptions: number;
}
