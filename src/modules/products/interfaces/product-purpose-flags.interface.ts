import { Product } from '@prisma/client';

export type ProductPurposeFlags = Pick<
  Product,
  'isForSale' | 'isForInternalUse'
>;
