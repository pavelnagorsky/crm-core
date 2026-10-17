import { ServiceCatalogKind } from '../../enums/service-catalog-kind.enum.js';

export interface ServiceCatalogKey {
  id: string;
  kind: ServiceCatalogKind;
}
