import { Prisma } from '@prisma/client';

/** What all promotions of a location did to the visits of one period. */
export interface PromotionPeriodTotals {
  /** What the items with a promotion cost the clients. */
  revenue: Prisma.Decimal;
  /** Discounts given, positive. */
  discount: Prisma.Decimal;
  bookingsCount: number;
  /** Clients for whom such a booking was the first in the brand. */
  newClients: number;
}
