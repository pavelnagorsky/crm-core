import { Prisma } from '@prisma/client';
import { PUBLIC_PRODUCT_OFFER_SELECT } from '../constants/public-product.select.js';
import { BrandProductCatalog } from './brand-product-catalog.interface.js';

export interface PublicCatalogProduct extends Prisma.ProductLocationGetPayload<{
  select: typeof PUBLIC_PRODUCT_OFFER_SELECT;
}> {
  product: BrandProductCatalog['products'][number] & {
    category: BrandProductCatalog['categories'][number] | null;
  };
}
