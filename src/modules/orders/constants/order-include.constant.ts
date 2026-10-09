import { Prisma } from '@prisma/client';

export const orderInclude = {
  items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OrderInclude;
