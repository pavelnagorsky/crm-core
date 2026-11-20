import { PaymentSplit } from './payment-split.interface.js';

/** A payment as it enters a request hash: the split and the explicit local date. */
export interface PaymentIntentInput extends PaymentSplit {
  occurredAt?: string | null;
}
