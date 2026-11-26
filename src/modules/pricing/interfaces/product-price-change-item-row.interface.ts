import { PriceChangeSkip } from '@prisma/client';

/** A stored row of a product price change, money in minor units. */
export interface ProductPriceChangeItemRow {
  itemId: string;
  /** Null: the product row is gone. */
  productId: string | null;
  productLocationId: string | null;
  title: string;
  sku: string | null;
  categoryName: string | null;
  before: number;
  after: number;
  /** Only in the rollback response: the price before the rollback. */
  current?: number | null;
  applySkip: PriceChangeSkip | null;
  rollbackSkip: PriceChangeSkip | null;
  rolledBack: boolean;
}
