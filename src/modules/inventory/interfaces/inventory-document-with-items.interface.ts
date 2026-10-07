import { Prisma } from '@prisma/client';

export type InventoryDocumentWithItems = Prisma.InventoryDocumentGetPayload<{
  include: { items: true };
}>;
