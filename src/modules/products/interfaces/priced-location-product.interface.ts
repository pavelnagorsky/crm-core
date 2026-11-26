import { Prisma, ProductStatus, ProductUnit } from '@prisma/client';

/**
 * A product a location sells (retail price set, product for sale), with what price screens
 * show: the price engine snapshot, product price changes and the price sheet
 * (docs/pricing-stage7-api.md).
 */
export interface PricedLocationProduct {
  productLocationId: string;
  productId: string;
  retailPrice: Prisma.Decimal;
  /** Status in the location. */
  status: ProductStatus;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: ProductUnit;
  categoryId: string | null;
  categoryName: string | null;
  categorySortOrder: number | null;
}
