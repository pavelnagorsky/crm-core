import { PaymentExpectations } from './payment-expectations.interface.js';
import { PaymentSplit } from './payment-split.interface.js';

/**
 * The payment as the person entered it, with an explicit date already in UTC and what they
 * saw when paying in one click.
 */
export interface PaymentRequest extends PaymentSplit, PaymentExpectations {
  occurredAt: Date | null;
}
