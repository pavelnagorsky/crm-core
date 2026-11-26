import { PriceRange } from '../../pricing/engine/interfaces/price-range.interface.js';

/** Price-list ranges of the cabinet catalog in minor units, without surcharges and promotions. */
export interface CatalogListPrices {
  /** By service id. */
  services: ReadonlyMap<string, PriceRange>;
  /** By bundle id. */
  bundles: ReadonlyMap<string, PriceRange>;
}
