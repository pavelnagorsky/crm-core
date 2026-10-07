import { Prisma } from '@prisma/client';

export interface ProductSalesSnapshot {
  revenue: Prisma.Decimal;
  standaloneOrderCount: number;
  linkedBookingIds: string[];
}
