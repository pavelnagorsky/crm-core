import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { PaymentTrackingMode } from '../../location/enums/payment-tracking-mode.enum.js';
import { PaymentTracking } from '../../location/interfaces/payment-tracking.interface.js';

/** Whether a visit (by startAt) or a sale (by occurredAt) at `at` is in payment tracking. */
export function isPaymentTracked(tracking: PaymentTracking, at: Date): boolean {
  return (
    tracking.mode === PaymentTrackingMode.MANUAL &&
    at.getTime() >= tracking.since.getTime()
  );
}

/** 409 PAYMENT_TRACKING_DISABLED when the location does not track payments. */
export function assertPaymentTrackingEnabled(tracking: PaymentTracking): void {
  if (tracking.mode === PaymentTrackingMode.DISABLED)
    throw new AppException(
      ErrorCode.PAYMENT_TRACKING_DISABLED,
      HttpStatus.CONFLICT,
    );
}
