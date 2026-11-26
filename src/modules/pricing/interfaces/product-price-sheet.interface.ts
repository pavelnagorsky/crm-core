import { ProductPriceSheetRow } from './product-price-sheet-row.interface.js';

/** The product price sheet: the headers as they are in the file and the data rows. */
export interface ProductPriceSheet {
  idHeader: string;
  priceHeader: string;
  rows: ProductPriceSheetRow[];
}
