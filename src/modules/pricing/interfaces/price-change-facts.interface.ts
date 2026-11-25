import { PriceChangeBundleFacts } from './price-change-bundle-facts.interface.js';
import { PriceChangeServiceFacts } from './price-change-service-facts.interface.js';

/** What the rows of a rule are computed from. */
export interface PriceChangeFacts {
  services: PriceChangeServiceFacts[];
  bundles: PriceChangeBundleFacts[];
  /** Non-default levels. */
  levels: { id: string; name: string; sortOrder: number }[];
  categories: { id: string; name: string; sortOrder: number }[];
}
