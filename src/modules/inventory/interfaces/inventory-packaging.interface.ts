import { Prisma } from '@prisma/client';

export interface InventoryPackaging {
  id: string;
  productId: string;
  name: string;
  quantityInBaseUnit: Prisma.Decimal;
}
