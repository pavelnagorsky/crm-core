import { Prisma } from '@prisma/client';

export interface ProductSalesSeriesRow {
  bucket: Date;
  revenue: Prisma.Decimal;
}
