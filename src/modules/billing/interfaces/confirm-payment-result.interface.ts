import { SubscriptionPayment } from '@prisma/client';

export interface ConfirmPaymentResult {
  payment: SubscriptionPayment;
  /** false when the payment was already PAID or did not match its snapshot. */
  applied: boolean;
}
