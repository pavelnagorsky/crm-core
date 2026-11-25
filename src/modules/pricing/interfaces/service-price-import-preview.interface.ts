import { PriceChangeConflict } from './price-change-conflict.interface.js';
import { PriceChangeGroup } from './price-change-group.interface.js';
import { ServicePriceImportCounts } from './service-price-import-counts.interface.js';
import { ServicePriceImportErrorEntry } from './service-price-import-error-entry.interface.js';
import { ServicePriceNewService } from './service-price-new-service.interface.js';

export interface ServicePriceImportPreview {
  /** YYYY-MM-DD: the effective date, or the location today. */
  date: string;
  newServices: ServicePriceNewService[];
  groups: PriceChangeGroup[];
  /** The first errors only. */
  errors: ServicePriceImportErrorEntry[];
  errorCount: number;
  counts: ServicePriceImportCounts;
  affectedBookingsCount: number;
  conflicts: PriceChangeConflict[];
  canApply: boolean;
}
