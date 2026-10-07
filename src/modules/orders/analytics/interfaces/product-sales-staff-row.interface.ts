import { Prisma } from '@prisma/client';

export interface ProductSalesStaffRow {
  staffId: string;
  staffName: string;
  orderCount: number;
  revenue: Prisma.Decimal;
}
