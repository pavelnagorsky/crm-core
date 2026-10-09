import { Prisma, ProductUnit } from '@prisma/client';

export interface InventoryReplenishmentItemView {
  productLocationId: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: ProductUnit;
  quantityOnHand: Prisma.Decimal;
  reorderLevel: Prisma.Decimal;
  missingQuantity: Prisma.Decimal;
  stockValue: Prisma.Decimal;
  updatedAt: Date | null;
}
