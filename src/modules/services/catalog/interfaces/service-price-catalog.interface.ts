import { ServicePriceCatalogBundle } from './service-price-catalog-bundle.interface.js';
import { ServicePriceCatalogCategory } from './service-price-catalog-category.interface.js';
import { ServicePriceCatalogService } from './service-price-catalog-service.interface.js';

/** Everything with a price in the catalog of a location: what the price file lists. */
export interface ServicePriceCatalog {
  categories: ServicePriceCatalogCategory[];
  services: ServicePriceCatalogService[];
  bundles: ServicePriceCatalogBundle[];
}
