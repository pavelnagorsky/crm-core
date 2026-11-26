import { PriceExportSnapshot } from './price-export-snapshot.interface.js';
import { ServicePriceStaffSheet } from './service-price-staff-sheet.interface.js';
import { ServicePricesSheet } from './service-prices-sheet.interface.js';

export interface ServicePriceBook {
  prices: ServicePricesSheet;
  /** Null when the file has no sheet "Личные цены". */
  staff: ServicePriceStaffSheet | null;
  /** The prices as exported; null for a file without export data. */
  snapshot: PriceExportSnapshot | null;
}
