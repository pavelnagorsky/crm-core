import { BillingPlan } from '@prisma/client';
import { EffectiveLimits } from './effective-limits.interface.js';
import { SubscriptionPrice } from './subscription-price.interface.js';

/** A plan the owner may pay for: its price and the limits it would give. */
export interface PlanOffer {
  plan: BillingPlan;
  price: SubscriptionPrice;
  limits: EffectiveLimits;
}
