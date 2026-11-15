import { BillingPeriod, BillingPlan } from '@prisma/client';
import { BillingActor } from './billing-actor.interface.js';
import { SubscriptionPrice } from './subscription-price.interface.js';

/** Owner request for renewal: plan and price are already checked by the caller. */
export interface PaymentRequestInput {
  plan: BillingPlan;
  billingPeriod: BillingPeriod;
  price: SubscriptionPrice;
  comment: string | null;
  actor: BillingActor;
}
