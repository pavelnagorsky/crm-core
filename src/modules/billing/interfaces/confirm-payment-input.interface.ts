import { Prisma, SubscriptionPaymentMethod } from '@prisma/client';
import { BillingActor } from './billing-actor.interface.js';

/** One entry point for every provider: the admin button now, webhooks later. */
export interface ConfirmPaymentInput {
  paidAt: Date;
  method: SubscriptionPaymentMethod;
  /** Must equal the payment snapshot, otherwise PAYMENT_MISMATCH and nothing is applied. */
  amount: Prisma.Decimal | string;
  currency: string;
  externalId?: string | null;
  reference?: string | null;
  adminNote?: string | null;
  providerData?: Prisma.InputJsonValue;
  actor: BillingActor;
}
