import { Prisma } from '@prisma/client';

/** The same figures of the promotion page for the previous period of equal length. */
export interface PromotionReportPrevious {
  revenue: Prisma.Decimal;
  discount: Prisma.Decimal;
  bookingsCount: number;
  salesCount: number;
  clientsCount: number;
  returnedRate: number | null;
}
