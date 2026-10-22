import { Prisma } from '@prisma/client';

export type PublicCatalogProduct = Prisma.ProductLocationGetPayload<{
  include: {
    product: {
      include: {
        category: true;
        imageFile: true;
      };
    };
  };
}>;
