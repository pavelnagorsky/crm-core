import { Prisma } from '@prisma/client';
import {
  PUBLIC_PRODUCT_CATEGORY_SELECT,
  PUBLIC_PRODUCT_SELECT,
} from '../constants/public-product.select.js';

export interface BrandProductCatalog {
  products: Prisma.ProductGetPayload<{
    select: typeof PUBLIC_PRODUCT_SELECT;
  }>[];
  categories: Prisma.ProductCategoryGetPayload<{
    select: typeof PUBLIC_PRODUCT_CATEGORY_SELECT;
  }>[];
}
