import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceCatalogEntry } from './service-catalog-entry.interface.js';

export interface ServiceCatalogServiceItem extends ServiceCatalogEntry {
  kind: ServiceCatalogKind.SERVICE;
  bufferMinutes: number;
  hasNoStaff: boolean;
}
