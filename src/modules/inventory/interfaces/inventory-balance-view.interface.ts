import { Prisma, ProductUnit } from '@prisma/client';

export interface InventoryBalanceView {
  productLocationId: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: ProductUnit;
  quantityOnHand: Prisma.Decimal;
  averageUnitCost: Prisma.Decimal;
  stockValue: Prisma.Decimal;
  reorderLevel: Prisma.Decimal;
  lowStock: boolean;
  updatedAt: Date | null;
}
