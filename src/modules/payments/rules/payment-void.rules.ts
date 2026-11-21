import { HttpStatus } from '@nestjs/common';
import { Payment, PaymentOperation } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

/** Whether every record of the operation is voided already: a void or undo has nothing to do. */
export function isOperationVoided(operation: {
  payments: readonly Pick<Payment, 'voidedAt'>[];
}): boolean {
  return operation.payments.every((payment) => payment.voidedAt !== null);
}

/**
 * 409 PAYMENT_OPERATION_LINKED_TO_RETURN for the refund of a product return: it goes away
 * only with its return.
 */
export function assertVoidNotLinkedToReturn(
  operation: Pick<PaymentOperation, 'orderReturnId'>,
): void {
  if (operation.orderReturnId)
    throw new AppException(
      ErrorCode.PAYMENT_OPERATION_LINKED_TO_RETURN,
      HttpStatus.CONFLICT,
    );
}

/**
 * 409 PAYMENT_VOID_HAS_REFUNDS when a payment is voided while the order has active refunds:
 * without the payment they would leave a negative paid amount.
 */
export function assertPaymentVoidWithoutRefunds(hasActiveRefunds: boolean): void {
  if (hasActiveRefunds)
    throw new AppException(
      ErrorCode.PAYMENT_VOID_HAS_REFUNDS,
      HttpStatus.CONFLICT,
    );
}
