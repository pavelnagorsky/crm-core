import { PaymentSplit } from './payment-split.interface.js';

/** A payment as it enters a request hash: the split, the explicit local date and expectations. */
export interface PaymentIntentInput extends PaymentSplit {
  occurredAt?: string | null;
  expectedAmount?: string | null;
  expectNoPayment?: boolean | null;
}
