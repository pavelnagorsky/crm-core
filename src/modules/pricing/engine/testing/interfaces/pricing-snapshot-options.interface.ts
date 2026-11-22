import { PricingBundleEntry } from '../../interfaces/pricing-bundle-entry.interface.js';

export interface PricingSnapshotOptions {
  /** Catalog price of each service, by id, in minor units. */
  services?: Record<string, number>;
  bundles?: PricingBundleEntry[];
}
