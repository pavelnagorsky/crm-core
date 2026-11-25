import { ServicePriceImportRowError } from '../enums/service-price-import-row-error.enum.js';
import { ServicePriceImportSheet } from '../enums/service-price-import-sheet.enum.js';

export interface ServicePriceImportErrorEntry {
  sheet: ServicePriceImportSheet;
  /** The row number as in Excel (1 is the header). */
  row: number;
  /** The header from the file, or null. */
  column: string | null;
  code: ServicePriceImportRowError;
}
