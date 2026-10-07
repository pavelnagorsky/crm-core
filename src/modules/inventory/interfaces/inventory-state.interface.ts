import { Prisma } from '@prisma/client';

export interface InventoryState {
  quantity: Prisma.Decimal;
  averageUnitCost: Prisma.Decimal;
}
