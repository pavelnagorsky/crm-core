import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';
import { PaymentPart } from '../interfaces/payment-part.interface.js';
import { PaymentSplit } from '../interfaces/payment-split.interface.js';
import { PaymentTotals } from '../interfaces/payment-totals.interface.js';

/** MIXED takes two positive parts; CASH and CARD take none: their amount is the amount due. */
export function assertPaymentSplit(split: PaymentSplit): void {
  const hasCash = split.cashAmount != null;
  const hasCard = split.cardAmount != null;
  const valid =
    split.method === PaymentInputMethod.MIXED
      ? hasCash &&
        hasCard &&
        MoneyUtils.decimal(split.cashAmount).gt(0) &&
        MoneyUtils.decimal(split.cardAmount).gt(0)
      : !hasCash && !hasCard;
  if (!valid)
    throw new AppException(
      ErrorCode.PAYMENT_SPLIT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
}

/**
 * What a payment must cover so that the order ends up paid: the amount due plus active
 * refunds. 409 PAYMENT_NOTHING_DUE when that is not positive.
 */
export function requiredPaymentAmount(
  amountDue: Prisma.Decimal,
  totals: Pick<PaymentTotals, 'refundedAmount'>,
): Prisma.Decimal {
  const requiredAmount = amountDue.plus(totals.refundedAmount);
  if (requiredAmount.lte(0))
    throw new AppException(ErrorCode.PAYMENT_NOTHING_DUE, HttpStatus.CONFLICT);
  return requiredAmount;
}

/**
 * Records of a payment. `requiredAmount` is what the payment must cover so that the order
 * ends up paid: the amount due plus active refunds (equal to the amount due when nothing was
 * refunded). A single method saves it as a snapshot; MIXED parts must add up to it, otherwise
 * 409 PAYMENT_AMOUNT_MISMATCH with `{ amountDue, requiredAmount }`.
 */
export function resolvePaymentParts(
  split: PaymentSplit,
  requiredAmount: Prisma.Decimal,
  amountDue: Prisma.Decimal,
): PaymentPart[] {
  assertPaymentSplit(split);
  if (split.method === PaymentInputMethod.CASH)
    return [{ method: PaymentMethod.CASH, amount: requiredAmount }];
  if (split.method === PaymentInputMethod.CARD)
    return [{ method: PaymentMethod.CARD, amount: requiredAmount }];
  const cash = MoneyUtils.decimal(split.cashAmount);
  const card = MoneyUtils.decimal(split.cardAmount);
  if (!cash.plus(card).equals(requiredAmount))
    throw new AppException(
      ErrorCode.PAYMENT_AMOUNT_MISMATCH,
      HttpStatus.CONFLICT,
      {
        amountDue: MoneyUtils.format(amountDue),
        requiredAmount: MoneyUtils.format(requiredAmount),
      },
    );
  return [
    { method: PaymentMethod.CASH, amount: cash },
    { method: PaymentMethod.CARD, amount: card },
  ];
}
