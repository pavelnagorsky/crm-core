import { ProductCatalogItemKind } from '../enums/product-catalog-item-kind.enum.js';

/**
 * A product or a product category of a brand was deleted; modules that keep ids of it
 * without a foreign key (price rule targets in every location of the brand) clean up.
 */
export interface ProductCatalogItemRemovedEvent {
  brandId: string;
  kind: ProductCatalogItemKind;
  id: string;
}
