import { createHash } from 'node:crypto';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentIntentInput } from '../interfaces/payment-intent-input.interface.js';
import { RefundIntentInput } from '../interfaces/refund-intent-input.interface.js';

/**
 * The payment intent as it enters a request hash. The amount due is not part of it: the same
 * request against a changed price is still a retry of the same action.
 */
export function paymentIntent(details: PaymentIntentInput | null | undefined) {
  if (!details) return null;
  return {
    method: details.method,
    cashAmount: amountOrNull(details.cashAmount),
    cardAmount: amountOrNull(details.cardAmount),
    occurredAt: details.occurredAt ?? null,
  };
}

/** Hash of a payment of a booking or an order, with the product items it confirms. */
export function paymentRequestHash(
  target: { bookingId: string } | { orderId: string },
  details: PaymentIntentInput,
  confirmProductItemIds: readonly string[] = [],
): string {
  return sha256({
    type: 'PAYMENT',
    target,
    payment: paymentIntent(details),
    confirmProductItemIds: [...confirmProductItemIds].sort(),
  });
}

export function refundRequestHash(
  orderId: string,
  details: RefundIntentInput,
): string {
  return sha256({
    type: 'REFUND',
    orderId,
    method: details.method,
    amount: MoneyUtils.format(details.amount),
    occurredAt: details.occurredAt ?? null,
    reason: details.reason?.trim() || null,
  });
}

function amountOrNull(value: string | null | undefined): string | null {
  return value == null ? null : MoneyUtils.format(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
