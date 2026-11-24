import { Prisma } from '@prisma/client';

/** Live bookings of a client that got the personal client discount, all time. */
export interface ClientDiscountStats {
  bookingsCount: number;
  /** Sum of the discounts, positive. */
  amount: Prisma.Decimal;
}
