import { Prisma } from '@prisma/client';

export interface InventoryDocumentDraft {
  items: Prisma.InventoryDocumentItemUncheckedCreateWithoutDocumentInput[];
  supplierId: string | null;
  supplierName: string | null;
}
