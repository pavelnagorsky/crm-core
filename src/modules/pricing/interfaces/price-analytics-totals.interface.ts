import { Prisma } from '@prisma/client';

export interface PriceAnalyticsTotals {
  regular: Prisma.Decimal;
  surcharges: Prisma.Decimal;
  discounts: Prisma.Decimal;
  received: Prisma.Decimal;
  /** regular + surcharges. */
  listTotal: Prisma.Decimal;
  itemsCount: number;
  bookingsCount: number;
  salesCount: number;
  clientsCount: number;
}
