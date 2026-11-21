import { PaymentIntentInput } from '../interfaces/payment-intent-input.interface.js';
import { PaymentRequest } from '../interfaces/payment-request.interface.js';
import { paymentExpectations } from './payment-expectations.rules.js';
import { assertPaymentSplit } from './payment-parts.rules.js';

/**
 * A validated payment request, before any lock: the split shape and the expectations
 * (400 PAYMENT_SPLIT_INVALID). `occurredAt` is the explicit date already in UTC.
 */
export function paymentRequest(
  input: PaymentIntentInput,
  occurredAt: Date | null,
): PaymentRequest {
  assertPaymentSplit(input);
  return {
    method: input.method,
    cashAmount: input.cashAmount ?? null,
    cardAmount: input.cardAmount ?? null,
    occurredAt,
    ...paymentExpectations(input),
  };
}
