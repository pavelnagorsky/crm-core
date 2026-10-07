import { Prisma } from '@prisma/client';

export type ProductWithDetails = Prisma.ProductGetPayload<{
  include: {
    category: true;
    imageFile: true;
    locations: true;
  };
}>;
