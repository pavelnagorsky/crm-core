import { BillingPeriod, BillingPlan } from '@prisma/client';
import { BillingUsage } from './billing-usage.interface.js';
import { EffectiveLimits } from './effective-limits.interface.js';

/** Plan change with a paid remainder (plan section 4.4). */
export interface PlanChangeQuote {
  plan: BillingPlan;
  billingPeriod: BillingPeriod;
  paidUntilBefore: Date;
  paidUntilAfter: Date;
  limits: EffectiveLimits;
  usage: BillingUsage;
  fits: boolean;
}
