import { Order } from '@prisma/client';

/**
 * The moment that puts an order in payment tracking: the start of its visit for a visit order
 * (as the booking card and the finance summary, deleted bookings included), the date of a
 * sale otherwise. Only a visit order whose booking no longer exists falls back to its date.
 */
export function orderPaymentMoment(
  order: Pick<Order, 'bookingId' | 'occurredAt'>,
  visitStartAt: Date | undefined,
): Date {
  return order.bookingId && visitStartAt ? visitStartAt : order.occurredAt;
}
