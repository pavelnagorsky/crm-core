import { PricingBundleEntry } from './pricing-bundle-entry.interface.js';
import { PricingServiceEntry } from './pricing-service-entry.interface.js';

/** Everything the engine needs to price a location, as plain data. */
export interface PricingSnapshot {
  services: PricingServiceEntry[];
  bundles: PricingBundleEntry[];
}
