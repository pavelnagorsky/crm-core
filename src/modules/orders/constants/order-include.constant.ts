import { Prisma } from '@prisma/client';

export const orderInclude = {
  items: {
    include: {
      productLocation: {
        include: {
          product: { include: { imageFile: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.OrderInclude;
