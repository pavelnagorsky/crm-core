import { PriceChangeConflict } from './price-change-conflict.interface.js';
import { ProductPriceChangeCounts } from './product-price-change-counts.interface.js';
import { ProductPriceChangeRow } from './product-price-change-row.interface.js';

/** The preview of a product price change rule. */
export interface ProductPriceChangePreview {
  /** YYYY-MM-DD the "before" prices are taken on. */
  date: string;
  rows: ProductPriceChangeRow[];
  counts: ProductPriceChangeCounts;
  conflicts: PriceChangeConflict[];
}
