import { InventoryMovementType, Prisma, ProductUnit } from '@prisma/client';

export interface InventoryTurnoverLine {
  productLocationId: string;
  name: string;
  sku: string | null;
  unit: ProductUnit;
  openingQuantity: Prisma.Decimal;
  openingValue: Prisma.Decimal;
  quantities: Record<InventoryMovementType, Prisma.Decimal>;
  periodValue: Prisma.Decimal;
  closingQuantity: Prisma.Decimal;
  closingValue: Prisma.Decimal;
}
