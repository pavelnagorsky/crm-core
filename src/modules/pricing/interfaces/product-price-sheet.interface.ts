import { PriceExportSnapshot } from './price-export-snapshot.interface.js';
import { ProductPriceSheetRow } from './product-price-sheet-row.interface.js';

/** The product price sheet: the headers as they are in the file and the data rows. */
export interface ProductPriceSheet {
  idHeader: string;
  priceHeader: string;
  rows: ProductPriceSheetRow[];
  /** The prices as exported; null for a file without export data. */
  snapshot: PriceExportSnapshot | null;
}
