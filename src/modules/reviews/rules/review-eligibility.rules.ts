import { HttpStatus } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ReviewableBooking } from '../interfaces/reviewable-booking.interface.js';

export function isBookingReviewable(
  booking: Pick<ReviewableBooking, 'status' | 'deletedAt'>,
  reviewsEnabled: boolean,
): boolean {
  return (
    reviewsEnabled &&
    booking.deletedAt == null &&
    booking.status === BookingStatus.COMPLETED
  );
}

export function assertBookingReviewable(
  booking: Pick<ReviewableBooking, 'status' | 'deletedAt'>,
  reviewsEnabled: boolean,
): void {
  if (!isBookingReviewable(booking, reviewsEnabled))
    throw new AppException(ErrorCode.REVIEW_NOT_ALLOWED, HttpStatus.FORBIDDEN);
}
