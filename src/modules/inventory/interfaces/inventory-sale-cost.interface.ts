import { Prisma } from '@prisma/client';

export interface InventorySaleCost {
  orderItemId: string;
  unitCost: Prisma.Decimal | null;
  lineCost: Prisma.Decimal | null;
}
