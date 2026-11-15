import { BillingPlan, Subscription } from '@prisma/client';

export interface SubscriptionWithPlan extends Subscription {
  plan: BillingPlan | null;
}
