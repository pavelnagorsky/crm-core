import { Prisma } from '@prisma/client';

export interface InventoryDocumentItemValues {
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  packagingId: string | null;
  packagingName: string | null;
  packagingFactor: Prisma.Decimal | null;
  packageQuantity: Prisma.Decimal | null;
  packageUnitCost: Prisma.Decimal | null;
}
