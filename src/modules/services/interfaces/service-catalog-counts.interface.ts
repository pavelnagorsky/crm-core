import { ServiceCatalogKindCount } from './service-catalog-kind-count.interface.js';
import { ServiceStatusCount } from './service-status-count.interface.js';

export interface ServiceCatalogCounts {
  total: number;
  byStatus: ServiceStatusCount[];
  byKind: ServiceCatalogKindCount[];
}
