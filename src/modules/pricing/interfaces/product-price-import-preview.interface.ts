import { PriceChangeConflict } from './price-change-conflict.interface.js';
import { ProductPriceChangeRow } from './product-price-change-row.interface.js';
import { ProductPriceImportErrorEntry } from './product-price-import-error-entry.interface.js';

/** The checked product price file: the price changes it makes and the row errors. */
export interface ProductPriceImportPreview {
  date: string;
  rows: ProductPriceChangeRow[];
  /** The first errors only; errorCount has them all. */
  errors: ProductPriceImportErrorEntry[];
  errorCount: number;
  counts: { products: number; rows: number };
  conflicts: PriceChangeConflict[];
  canApply: boolean;
}
