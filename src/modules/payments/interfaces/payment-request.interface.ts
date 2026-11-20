import { PaymentSplit } from './payment-split.interface.js';

/** The payment as the person entered it, with an explicit date already in UTC. */
export interface PaymentRequest extends PaymentSplit {
  occurredAt: Date | null;
}
