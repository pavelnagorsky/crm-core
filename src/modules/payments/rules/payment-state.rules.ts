import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { PaymentJournalRecord } from '../interfaces/payment-journal-record.interface.js';
import { PaymentTotals } from '../interfaces/payment-totals.interface.js';

/** Sums the active records: payments minus refunds, overall and by method. */
export function paymentTotals(
  records: readonly PaymentJournalRecord[],
): PaymentTotals {
  let cash = MoneyUtils.decimal(0);
  let card = MoneyUtils.decimal(0);
  let refunded = MoneyUtils.decimal(0);
  let hasRecords = false;
  for (const record of records) {
    if (record.voidedAt) continue;
    hasRecords = true;
    const amount = MoneyUtils.decimal(record.amount);
    const isRefund = record.type === PaymentType.REFUND;
    if (isRefund) refunded = refunded.plus(amount);
    const signed = isRefund ? amount.neg() : amount;
    if (record.method === PaymentMethod.CASH) cash = cash.plus(signed);
    else card = card.plus(signed);
  }
  return {
    paidAmount: cash.plus(card),
    cashAmount: cash,
    cardAmount: card,
    refundedAmount: refunded,
    hasRecords,
  };
}

/**
 * The most that can go back by one method: what that method brought in net of its refunds,
 * and never more than the paid amount overall. Not below 0. A card payment is not given back
 * in cash.
 */
export function refundLimit(
  totals: Pick<PaymentTotals, 'paidAmount' | 'cashAmount' | 'cardAmount'>,
  method: PaymentMethod,
): Prisma.Decimal {
  const byMethod =
    method === PaymentMethod.CASH ? totals.cashAmount : totals.cardAmount;
  return Prisma.Decimal.max(0, Prisma.Decimal.min(byMethod, totals.paidAmount));
}

/** Derived payment state. Nothing about it is stored or changed automatically. */
export function paymentStatus(
  amountDue: Prisma.Decimal,
  totals: Pick<PaymentTotals, 'paidAmount' | 'hasRecords'>,
): PaymentStatus {
  if (!totals.hasRecords)
    return amountDue.gt(0)
      ? PaymentStatus.NOT_SPECIFIED
      : PaymentStatus.NOT_REQUIRED;
  const comparison = totals.paidAmount.comparedTo(amountDue);
  if (comparison === 0) return PaymentStatus.PAID;
  return comparison < 0 ? PaymentStatus.UNDERPAID : PaymentStatus.OVERPAID;
}
