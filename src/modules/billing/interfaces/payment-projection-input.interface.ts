import { BillingPeriod, BillingPlan } from '@prisma/client';
import { ComplimentaryLength } from './complimentary-length.type.js';

/** A payment as it would be applied to a subscription. */
export interface PaymentProjectionInput {
  plan: BillingPlan | null;
  billingPeriod: BillingPeriod;
  paidAt: Date;
  /** Set for an extension without payment: its length instead of the paid period. */
  complimentary?: ComplimentaryLength;
}
