import {
  BillingPeriod,
  BillingPlan,
  Prisma,
  SubscriptionPaymentMethod,
} from '@prisma/client';
import { BillingActor } from './billing-actor.interface.js';

/** Payment recorded by an admin without a request: created PAID and applied at once. */
export interface AdminPaymentInput {
  plan: BillingPlan;
  billingPeriod: BillingPeriod;
  amount: Prisma.Decimal;
  currency: string;
  paidAt: Date;
  method: SubscriptionPaymentMethod;
  reference: string | null;
  adminNote: string | null;
  actor: BillingActor;
}
