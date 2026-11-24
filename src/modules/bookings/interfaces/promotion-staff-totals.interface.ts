import { Prisma } from '@prisma/client';

/** Running totals of one staff member in the promotion report. */
export interface PromotionStaffTotals {
  name: string;
  bookings: Set<string>;
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
}
