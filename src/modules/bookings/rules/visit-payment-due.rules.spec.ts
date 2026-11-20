import { BookingStatus, Prisma } from '@prisma/client';
import {
  completesOnPayment,
  visitAmountDue,
  visitServicesDue,
} from './visit-payment-due.rules.js';

const d = (value: string | number) => new Prisma.Decimal(value);
const items = [
  { chargedPrice: d('1500.00'), customPrice: null },
  { chargedPrice: d('900.00'), customPrice: d('1000.50') },
];

function visit(status: BookingStatus, deletedAt: Date | null = null) {
  return { status, deletedAt, items };
}

describe('visitServicesDue', () => {
  it.each([
    BookingStatus.PENDING,
    BookingStatus.CONFIRMED,
    BookingStatus.COMPLETED,
  ])('counts custom or charged prices for %s', (status) => {
    expect(visitServicesDue(visit(status)).toFixed(2)).toBe('2500.50');
  });

  it.each([BookingStatus.NO_SHOW, BookingStatus.CANCELLED])(
    'is 0 for %s',
    (status) => {
      expect(visitServicesDue(visit(status)).toFixed(2)).toBe('0.00');
    },
  );

  it('is 0 for a deleted booking', () => {
    expect(
      visitServicesDue(visit(BookingStatus.COMPLETED, new Date())).toFixed(2),
    ).toBe('0.00');
  });
});

describe('visitAmountDue', () => {
  it('adds sold products to the services', () => {
    expect(
      visitAmountDue(visit(BookingStatus.CONFIRMED), d('300')).toFixed(2),
    ).toBe('2800.50');
  });

  it('leaves only sold products for a no-show', () => {
    expect(
      visitAmountDue(visit(BookingStatus.NO_SHOW), d('300')).toFixed(2),
    ).toBe('300.00');
  });
});

describe('completesOnPayment', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const started = new Date('2026-11-20T10:00:00.000Z');
  const later = new Date('2026-11-20T10:00:01.000Z');

  it('completes a started PENDING or CONFIRMED visit', () => {
    expect(
      completesOnPayment(
        { status: BookingStatus.CONFIRMED, startAt: started },
        now,
      ),
    ).toBe(true);
    expect(
      completesOnPayment(
        { status: BookingStatus.PENDING, startAt: started },
        now,
      ),
    ).toBe(true);
  });

  it('keeps a visit that has not started (prepayment)', () => {
    expect(
      completesOnPayment(
        { status: BookingStatus.CONFIRMED, startAt: later },
        now,
      ),
    ).toBe(false);
  });

  it.each([
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
    BookingStatus.CANCELLED,
  ])('never changes %s', (status) => {
    expect(completesOnPayment({ status, startAt: started }, now)).toBe(false);
  });
});
