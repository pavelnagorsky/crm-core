import { ProductPriceImportErrorEntry } from './product-price-import-error-entry.interface.js';

/** The checked product price file: new prices by product and the row errors. */
export interface ProductPriceImportPlan {
  /** New price in minor units by Product.id, in file order. */
  prices: Map<string, number>;
  errors: ProductPriceImportErrorEntry[];
}
