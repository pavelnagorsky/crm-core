import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';

export interface ServiceCatalogKindCount {
  kind: ServiceCatalogKind;
  count: number;
}
