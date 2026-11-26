import { Prisma, ProductStatus, ProductUnit } from '@prisma/client';

/** One product of a product price change preview, money in minor units. */
export interface ProductPriceChangeRow {
  /** PRODUCT:<productId> */
  key: string;
  productId: string;
  productLocationId: string;
  title: string;
  sku: string | null;
  unit: ProductUnit;
  categoryId: string | null;
  categoryName: string | null;
  /** Status in the location. */
  status: ProductStatus;
  before: number;
  after: number;
  invalid: boolean;
  checked: boolean;
  /** Last purchase unit cost; null without receipts or without the inventory read access. */
  lastPurchaseUnitCost: Prisma.Decimal | null;
  /** "After" is below the last purchase unit cost (computed with or without the access). */
  belowCost: boolean;
}
