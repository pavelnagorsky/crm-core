import { Booking, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { VisitDueBooking } from '../interfaces/visit-due-booking.interface.js';

/** Statuses whose services are to be paid: the visit happens or happened. */
const SERVICES_DUE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

/** Booking statuses that close a visit that did not take place. */
export const CLOSED_WITHOUT_VISIT_STATUSES: readonly BookingStatus[] = [
  BookingStatus.NO_SHOW,
  BookingStatus.CANCELLED,
];

/**
 * Services of a visit to be paid: the sum of (customPrice ?? chargedPrice) while the booking
 * is not deleted and PENDING, CONFIRMED or COMPLETED; otherwise 0. Taken from the booking,
 * so a visit can be paid before completion; after completion the order holds the same lines.
 */
export function visitServicesDue(booking: VisitDueBooking): Prisma.Decimal {
  if (
    booking.deletedAt ||
    !SERVICES_DUE_STATUSES.includes(booking.status as BookingStatus)
  )
    return MoneyUtils.decimal(0);
  return booking.items.reduce(
    (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
    MoneyUtils.decimal(0),
  );
}

/** Amount due of a visit: its services plus the products sold in the visit order. */
export function visitAmountDue(
  booking: VisitDueBooking,
  productsNet: Prisma.Decimal,
): Prisma.Decimal {
  return visitServicesDue(booking).plus(productsNet);
}

/** A PENDING or CONFIRMED visit that has started is completed when it is paid. */
export function completesOnPayment(
  booking: Pick<Booking, 'status' | 'startAt'>,
  now: Date,
): boolean {
  return (
    (booking.status === BookingStatus.PENDING ||
      booking.status === BookingStatus.CONFIRMED) &&
    booking.startAt.getTime() <= now.getTime()
  );
}
