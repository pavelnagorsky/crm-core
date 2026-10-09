import { Prisma } from '@prisma/client';

export interface InventoryKpiSummaryRow {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockValue: Prisma.Decimal;
  deadStockCount: number;
  movingProductsCount: number;
}
