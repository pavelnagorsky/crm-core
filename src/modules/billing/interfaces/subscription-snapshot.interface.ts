import { SubscriptionPayment } from '@prisma/client';
import { SubscriptionWithPlan } from './subscription-with-plan.interface.js';

/** Cached per brand. `subscription: null` means no row (FREE) and is cached too. */
export interface SubscriptionSnapshot {
  subscription: SubscriptionWithPlan | null;
  pendingPayment: SubscriptionPayment | null;
}
