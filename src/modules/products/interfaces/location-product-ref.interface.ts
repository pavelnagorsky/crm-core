import { Prisma } from '@prisma/client';

/** A product row of a location with its sale facts, whether it is sold now or not. */
export interface LocationProductRef {
  productLocationId: string;
  productId: string;
  name: string;
  sku: string | null;
  /** Current product category; null: none. */
  categoryName: string | null;
  retailPrice: Prisma.Decimal | null;
  isForSale: boolean;
}
