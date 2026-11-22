import { CatalogBundleOptions } from './catalog-bundle-options.interface.js';

export interface CatalogSnapshotOptions {
  /** Catalog price of each service, by id, as a decimal string. */
  services?: Record<string, string>;
  bundles?: CatalogBundleOptions[];
}
