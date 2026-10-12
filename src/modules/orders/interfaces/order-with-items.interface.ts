import { Prisma } from '@prisma/client';

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      include: {
        productLocation: {
          include: {
            product: { include: { imageFile: true } };
          };
        };
        returnItems: {
          include: {
            return: true;
          };
        };
      };
    };
  };
}>;
