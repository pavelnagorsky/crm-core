import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PAYMENT_UNDO_WINDOW_MS } from '../constants/payment.constants.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { PaymentUndoContext } from '../interfaces/payment-undo-context.interface.js';
import { UndoablePaymentOperation } from '../interfaces/undoable-payment-operation.interface.js';

/**
 * An undo fixes a mistaken click: only a first payment (not a replacement) of an order without
 * active refunds, only by its author (409 PAYMENT_UNDO_NOT_ALLOWED) and within 10 minutes of
 * the record (409 PAYMENT_UNDO_EXPIRED).
 */
export function assertPaymentUndoable(
  operation: UndoablePaymentOperation,
  context: PaymentUndoContext,
): void {
  const firstPayment =
    operation.type === PaymentType.PAYMENT &&
    operation.replacesOperationId === null;
  const byAuthor =
    context.actorId !== undefined && operation.createdById === context.actorId;
  if (!firstPayment || context.hasActiveRefunds || !byAuthor)
    throw new AppException(
      ErrorCode.PAYMENT_UNDO_NOT_ALLOWED,
      HttpStatus.CONFLICT,
    );
  if (
    context.now.getTime() - operation.createdAt.getTime() >
    PAYMENT_UNDO_WINDOW_MS
  )
    throw new AppException(ErrorCode.PAYMENT_UNDO_EXPIRED, HttpStatus.CONFLICT);
}
