import { Payment } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentAuditPayload } from '../../audit/interfaces/payment-audit-payload.interface.js';
import { PaymentChange } from '../interfaces/payment-change.interface.js';

function auditParts(
  payments: readonly Pick<Payment, 'method' | 'amount'>[],
): PaymentAuditPayload['parts'] {
  return payments.map((payment) => ({
    method: payment.method,
    amount: MoneyUtils.format(payment.amount),
  }));
}

/** Order history payload of a journal write: amounts as 2dp strings, dates in ISO. */
export function paymentAuditPayload(
  change: PaymentChange,
  bookingId: string | null,
): PaymentAuditPayload {
  const { operation, previous } = change;
  return {
    operationId: operation.id,
    operationType: operation.type,
    bookingId,
    parts: auditParts(operation.payments),
    occurredAt: operation.payments[0]?.occurredAt.toISOString() ?? null,
    amountDue: change.amountDue ? MoneyUtils.format(change.amountDue) : null,
    currency: change.currency,
    reason: change.reason,
    orderReturnId: operation.orderReturnId,
    previousOperationId: previous?.id ?? null,
    previousParts: previous ? auditParts(previous.payments) : null,
  };
}
