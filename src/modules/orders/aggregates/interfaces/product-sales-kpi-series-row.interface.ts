import { Prisma } from '@prisma/client';

export interface ProductSalesKpiSeriesRow {
  bucket: Date;
  revenue: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  buyerCount: number;
  repeatBuyerCount: number;
}
