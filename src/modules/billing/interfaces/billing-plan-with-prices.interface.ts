import { BillingPlan, BillingPlanPrice } from '@prisma/client';

/** A plan with every price version of every country, oldest first. */
export interface BillingPlanWithPrices extends BillingPlan {
  prices: BillingPlanPrice[];
}
