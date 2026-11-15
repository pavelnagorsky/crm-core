import { BillingPlan, BillingPlanPrice } from '@prisma/client';

/** A plan in the admin list: prices in force and scheduled ones, all countries. */
export interface AdminBillingPlan {
  plan: BillingPlan;
  subscriptions: number;
  currentPrices: BillingPlanPrice[];
  upcomingPrices: BillingPlanPrice[];
}
