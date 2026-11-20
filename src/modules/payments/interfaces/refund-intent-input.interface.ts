import { PaymentMethod } from '../enums/payment-method.enum.js';

/** A refund as it enters a request hash. */
export interface RefundIntentInput {
  method: PaymentMethod;
  amount: string;
  occurredAt?: string | null;
  reason?: string | null;
}
