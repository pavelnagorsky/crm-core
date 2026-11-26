import { Prisma } from '@prisma/client';

export const orderInclude = {
  items: {
    include: {
      productLocation: {
        include: {
          product: { include: { imageFile: true } },
        },
      },
      returnItems: {
        include: {
          return: true,
        },
      },
      priceAdjustments: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.OrderInclude;
