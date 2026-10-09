import { Prisma, ProductUnit } from '@prisma/client';

export interface InventoryTurnoverBucketRow {
  productLocationId: string;
  name: string;
  sku: string | null;
  unit: ProductUnit;
  bucket: string;
  quantity: Prisma.Decimal | string;
  value: Prisma.Decimal | string;
}
