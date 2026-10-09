import { InventoryMovementType, Prisma } from '@prisma/client';

export interface InventoryReportMovement {
  occurredAt: Date;
  type: InventoryMovementType;
  productName: string;
  productSku: string | null;
  quantityDelta: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  quantityBefore: Prisma.Decimal;
  quantityAfter: Prisma.Decimal;
  documentReference: string | null;
  orderId: string | null;
}
