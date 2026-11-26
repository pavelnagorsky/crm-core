import { ProductPriceImportRowError } from '../enums/product-price-import-row-error.enum.js';

export interface ProductPriceImportErrorEntry {
  /** The row number as in Excel (1 is the header). */
  row: number;
  /** The header from the file, or null. */
  column: string | null;
  code: ProductPriceImportRowError;
}
