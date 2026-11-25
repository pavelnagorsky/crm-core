import { BookingRepricingMode } from '../enums/booking-repricing-mode.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { assertRepricingAllowed } from './booking-repricing.rules.js';

describe('assertRepricingAllowed', () => {
  it.each([
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('rejects RECALCULATE of a %s visit', (status) => {
    expect(() =>
      assertRepricingAllowed({ status }, BookingRepricingMode.RECALCULATE),
    ).toThrow(
      expect.objectContaining({
        errorCode: 'BOOKING_REPRICE_COMPLETED',
        status: 400,
      }),
    );
  });

  it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED])(
    'allows RECALCULATE of a %s visit',
    (status) => {
      expect(() =>
        assertRepricingAllowed({ status }, BookingRepricingMode.RECALCULATE),
      ).not.toThrow();
    },
  );

  it('a finished visit may still be edited with KEEP', () => {
    for (const pricing of [BookingRepricingMode.KEEP, undefined])
      expect(() =>
        assertRepricingAllowed({ status: BookingStatus.COMPLETED }, pricing),
      ).not.toThrow();
  });
});
