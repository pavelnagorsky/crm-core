import { Prisma } from '@prisma/client';
export const documentInclude = {
  items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.InventoryDocumentInclude;
