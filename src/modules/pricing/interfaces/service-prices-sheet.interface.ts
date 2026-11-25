import { ServicePriceSheetColumn } from '../enums/service-price-sheet-column.enum.js';
import { ServicePriceLevelColumn } from './service-price-level-column.interface.js';
import { ServicePriceSheetRow } from './service-price-sheet-row.interface.js';

export interface ServicePricesSheet {
  /** Headers as written in the file; absent columns fall back to the canonical name. */
  headers: Record<ServicePriceSheetColumn, string>;
  levelColumns: ServicePriceLevelColumn[];
  rows: ServicePriceSheetRow[];
}
