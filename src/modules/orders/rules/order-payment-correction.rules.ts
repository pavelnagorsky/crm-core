import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { Payment, PaymentOperation } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { VisitPaymentFacts } from '../../bookings/visits/interfaces/visit-payment-facts.interface.js';
import { PaymentType } from '../../payments/enums/payment-type.enum.js';

/**
 * Voiding a refund brings money back on record, which a deleted visit may not have (as
 * deleting a paid visit is refused): 409 BOOKING_PAYMENT_NOT_ALLOWED for an active refund of
 * a deleted visit. Taking money off (voiding a payment) stays allowed.
 */
export function assertVoidAllowedForVisit(
  visit: Pick<VisitPaymentFacts, 'deleted'> | null,
  operation:
    | (Pick<PaymentOperation, 'type'> & {
        payments: readonly Pick<Payment, 'voidedAt'>[];
      })
    | null,
): void {
  if (
    visit?.deleted &&
    operation?.type === PaymentType.REFUND &&
    operation.payments.some((payment) => !payment.voidedAt)
  )
    throw new AppException(
      ErrorCode.BOOKING_PAYMENT_NOT_ALLOWED,
      HttpStatus.CONFLICT,
    );
}

/**
 * A caller limited to visits they take part in (`participantStaffId` set) must still perform a
 * service of the locked visit: a visit reassigned meanwhile is not theirs any more (403).
 */
export function assertVisitParticipant(
  visit: Pick<VisitPaymentFacts, 'staffIds'>,
  participantStaffId: string | undefined,
): void {
  if (participantStaffId && !visit.staffIds.includes(participantStaffId))
    throw new ForbiddenException('Access denied');
}
