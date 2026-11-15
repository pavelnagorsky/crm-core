import { BillingPeriod, BillingPlan } from '@prisma/client';
import { BillingUsage } from './billing-usage.interface.js';
import { EffectiveLimits } from './effective-limits.interface.js';
import { SubscriptionPrice } from './subscription-price.interface.js';

/** What a payment made today buys (plan sections 4.2 and 4.3). */
export interface PaymentQuote {
  plan: BillingPlan;
  billingPeriod: BillingPeriod;
  price: SubscriptionPrice;
  periodStart: Date;
  periodEnd: Date;
  /** Limits of the chosen plan for this subscription. */
  limits: EffectiveLimits;
  usage: BillingUsage;
  fits: boolean;
  /** A request is accepted: the usage fits, or the brand is blocked (plan section 4.2). */
  allowed: boolean;
}
