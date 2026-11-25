import { ServicePriceEdit } from './service-price-edit.interface.js';
import { ServicePriceImportErrorEntry } from './service-price-import-error-entry.interface.js';
import { ServicePriceNewService } from './service-price-new-service.interface.js';
import { ServicePriceStaffEdit } from './service-price-staff-edit.interface.js';

/** The file after the row checks: what it creates and sets, and every problem found. */
export interface ServicePriceImportPlan {
  newServices: ServicePriceNewService[];
  /** Names of the categories the new services need and the location lacks. */
  newCategories: string[];
  edits: ServicePriceEdit[];
  staffEdits: ServicePriceStaffEdit[];
  errors: ServicePriceImportErrorEntry[];
}
