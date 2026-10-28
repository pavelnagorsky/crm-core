import { Prisma } from '@prisma/client';
import { PUBLIC_FILE_SELECT } from '../../../shared/database/public-file.select.js';

export const PUBLIC_PRODUCT_SELECT = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  unit: true,
  imageFile: { select: PUBLIC_FILE_SELECT },
} satisfies Prisma.ProductSelect;

export const PUBLIC_PRODUCT_CATEGORY_SELECT = {
  id: true,
  name: true,
  description: true,
  sortOrder: true,
} satisfies Prisma.ProductCategorySelect;

export const PUBLIC_PRODUCT_OFFER_SELECT = {
  productId: true,
  retailPrice: true,
} satisfies Prisma.ProductLocationSelect;
