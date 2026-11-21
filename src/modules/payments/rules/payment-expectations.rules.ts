import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentInputMethod } from '../enums/payment-input-method.enum.js';
import { PaymentExpectations } from '../interfaces/payment-expectations.interface.js';
import { PaymentIntentInput } from '../interfaces/payment-intent-input.interface.js';

/**
 * Expectations of a payment request, checked before any lock. `expectedAmount` goes only with
 * CASH or CARD: with MIXED the parts already state the amount (400 PAYMENT_SPLIT_INVALID).
 */
export function paymentExpectations(
  input: Pick<PaymentIntentInput, 'method' | 'expectedAmount' | 'expectNoPayment'>,
): PaymentExpectations {
  const hasAmount = input.expectedAmount != null;
  if (hasAmount && input.method === PaymentInputMethod.MIXED)
    throw new AppException(
      ErrorCode.PAYMENT_SPLIT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  return {
    expectedAmount: hasAmount ? MoneyUtils.decimal(input.expectedAmount) : null,
    expectNoPayment: input.expectNoPayment === true,
  };
}

/** 409 PAYMENT_ALREADY_RECORDED with `{ operationId }` when no payment was expected. */
export function assertNoPaymentExpected(
  expectations: Pick<PaymentExpectations, 'expectNoPayment'>,
  activePaymentOperationId: string | null,
): void {
  if (expectations.expectNoPayment && activePaymentOperationId)
    throw new AppException(
      ErrorCode.PAYMENT_ALREADY_RECORDED,
      HttpStatus.CONFLICT,
      { operationId: activePaymentOperationId },
    );
}

/**
 * 409 PAYMENT_AMOUNT_MISMATCH with `{ amountDue, requiredAmount }` when the shown amount is
 * not what the payment must cover (the amount due plus active refunds).
 */
export function assertExpectedAmount(
  expectations: Pick<PaymentExpectations, 'expectedAmount'>,
  requiredAmount: Prisma.Decimal,
  amountDue: Prisma.Decimal,
): void {
  if (
    expectations.expectedAmount &&
    !expectations.expectedAmount.equals(requiredAmount)
  )
    throw new AppException(
      ErrorCode.PAYMENT_AMOUNT_MISMATCH,
      HttpStatus.CONFLICT,
      {
        amountDue: MoneyUtils.format(amountDue),
        requiredAmount: MoneyUtils.format(requiredAmount),
      },
    );
}
