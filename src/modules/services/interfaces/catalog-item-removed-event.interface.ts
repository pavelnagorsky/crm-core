import { CatalogItemKind } from '../enums/catalog-item-kind.enum.js';

/** A service, category or bundle was deleted; modules that keep ids of it without a foreign key clean up. */
export interface CatalogItemRemovedEvent {
  locationId: string;
  kind: CatalogItemKind;
  id: string;
}
