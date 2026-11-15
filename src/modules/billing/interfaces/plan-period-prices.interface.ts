import { BillingPlanPrice } from '@prisma/client';

/** Current price version per period; null when the period has no price. */
export interface PlanPeriodPrices {
  MONTH: BillingPlanPrice | null;
  YEAR: BillingPlanPrice | null;
}
