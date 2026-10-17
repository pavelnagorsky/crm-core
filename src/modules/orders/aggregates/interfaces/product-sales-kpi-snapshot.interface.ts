import { Prisma } from '@prisma/client';

export interface ProductSalesKpiSnapshot {
  revenue: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
  buyerCount: number;
  repeatBuyerCount: number;
}
