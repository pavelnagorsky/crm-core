import { HttpStatus } from '@nestjs/common';
import { Booking } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingRepricingMode } from '../enums/booking-repricing-mode.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';

/** A visit that is over keeps its prices: there is nothing to recalculate. */
const FINISHED_STATUSES: readonly BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

/** RECALCULATE of a completed, cancelled or missed visit is 400 BOOKING_REPRICE_COMPLETED. */
export function assertRepricingAllowed(
  booking: Pick<Booking, 'status'>,
  pricing: BookingRepricingMode | undefined,
): void {
  if (
    pricing === BookingRepricingMode.RECALCULATE &&
    FINISHED_STATUSES.includes(booking.status as BookingStatus)
  )
    throw new AppException(
      ErrorCode.BOOKING_REPRICE_COMPLETED,
      HttpStatus.BAD_REQUEST,
    );
}
