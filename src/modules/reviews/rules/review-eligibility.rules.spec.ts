import { HttpStatus } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import {
  assertBookingReviewable,
  isBookingReviewable,
} from './review-eligibility.rules.js';

const completed = { status: BookingStatus.COMPLETED, deletedAt: null };

describe('isBookingReviewable', () => {
  it('allows completed, not deleted bookings of locations with reviews enabled', () => {
    expect(isBookingReviewable(completed, true)).toBe(true);
  });

  it.each([
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('rejects %s bookings', (status) => {
    expect(isBookingReviewable({ ...completed, status }, true)).toBe(false);
  });

  it('rejects deleted bookings and locations with reviews disabled', () => {
    expect(
      isBookingReviewable({ ...completed, deletedAt: new Date() }, true),
    ).toBe(false);
    expect(isBookingReviewable(completed, false)).toBe(false);
  });
});

describe('assertBookingReviewable', () => {
  it('throws REVIEW_NOT_ALLOWED with 403', () => {
    try {
      assertBookingReviewable(completed, false);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect((error as AppException).errorCode).toBe('REVIEW_NOT_ALLOWED');
    }
  });
});
