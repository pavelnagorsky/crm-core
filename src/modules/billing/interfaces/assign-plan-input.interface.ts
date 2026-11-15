import { BillingPeriod, BillingPlan, Prisma } from '@prisma/client';

/** Admin assignment of a plan and custom terms. undefined keeps a field, null clears it. */
export interface AssignPlanInput {
  plan: BillingPlan;
  billingPeriod?: BillingPeriod;
  customStaffLimit?: number | null;
  customLocationLimit?: number | null;
  customCurrency?: string | null;
  customMonthlyPrice?: Prisma.Decimal | null;
  customYearlyPrice?: Prisma.Decimal | null;
  /** Convert the paid remainder into days of the new plan (plan section 4.4). */
  convertRemaining: boolean;
  reason: string;
}
