import { Prisma } from '@prisma/client';

/** Past bookings a draft promotion would have reached, and the discount by the price list. */
export interface PromotionMatches {
  bookingsCount: number;
  discount: Prisma.Decimal;
}
