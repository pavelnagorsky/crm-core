import { Prisma } from '@prisma/client';

export type LocationProductView = Prisma.ProductLocationGetPayload<{
  include: {
    product: {
      include: {
        category: true;
        imageFile: true;
      };
    };
  };
}>;
