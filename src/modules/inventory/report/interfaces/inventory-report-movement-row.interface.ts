import { InventoryMovementType, Prisma } from '@prisma/client';

export interface InventoryReportMovementRow {
  occurredAt: Date | string;
  type: InventoryMovementType;
  productName: string;
  productSku: string | null;
  quantityDelta: Prisma.Decimal | string;
  unitCost: Prisma.Decimal | string;
  totalCost: Prisma.Decimal | string;
  quantityBefore: Prisma.Decimal | string;
  quantityAfter: Prisma.Decimal | string;
  documentReference: string | null;
  orderId: string | null;
}
