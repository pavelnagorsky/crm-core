import { HttpStatus } from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { PaymentJournalRecord } from '../interfaces/payment-journal-record.interface.js';
import { OrderPaymentTotals } from '../interfaces/order-payment-totals.interface.js';
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

/**
 * Derived payment state. Nothing about it is stored or changed automatically. `tracked`
 * (payment tracking of the location covers the visit or sale) only tells a missing payment
 * apart: NOT_SPECIFIED when tracked, NOT_TRACKED otherwise. Records are shown as they are.
 */
export function paymentStatus(
  amountDue: Prisma.Decimal,
  totals: Pick<PaymentTotals, 'paidAmount' | 'hasRecords'>,
  tracked: boolean,
): PaymentStatus {
  if (!totals.hasRecords) {
    if (amountDue.lte(0)) return PaymentStatus.NOT_REQUIRED;
    return tracked ? PaymentStatus.NOT_SPECIFIED : PaymentStatus.NOT_TRACKED;
  }
  const comparison = totals.paidAmount.comparedTo(amountDue);
  if (comparison === 0) return PaymentStatus.PAID;
  return comparison < 0 ? PaymentStatus.UNDERPAID : PaymentStatus.OVERPAID;
}

/** Payment status of an order by its journal totals; no totals: nothing recorded. */
export function paymentStatusOf(
  amountDue: Prisma.Decimal,
  totals: Pick<OrderPaymentTotals, 'paidAmount' | 'hasRecords'> | null | undefined,
  tracked: boolean,
): PaymentStatus {
  return paymentStatus(
    amountDue,
    {
      paidAmount: totals?.paidAmount ?? MoneyUtils.decimal(0),
      hasRecords: totals?.hasRecords ?? false,
    },
    tracked,
  );
}

/**
 * 409 PAYMENT_REFUND_EXCEEDS_PAID with `{ paidAmount, method }` for a refund that is not
 * positive or exceeds what its method can give back (`refundLimit`).
 */
export function assertRefundWithinLimit(
  amount: Prisma.Decimal,
  limit: Prisma.Decimal,
  method: PaymentMethod,
): void {
  if (amount.lte(0) || amount.gt(limit))
    throw new AppException(
      ErrorCode.PAYMENT_REFUND_EXCEEDS_PAID,
      HttpStatus.CONFLICT,
      { paidAmount: MoneyUtils.format(limit), method },
    );
}

/** The operation of the active payment among the active records; null when there is none. */
export function activePaymentOperationId(
  records: readonly Pick<Payment, 'type' | 'operationId'>[],
): string | null {
  return (
    records.find((record) => record.type === PaymentType.PAYMENT)
      ?.operationId ?? null
  );
}
