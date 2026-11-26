import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { CATALOG_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { LocationCacheContext } from '../../../shared/cache/interfaces/location-cache-context.interface.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';

/**
 * Prices of a location as the engine reads them. Plain data (records and arrays, no Map).
 * Invalidated by the services, staff, products and pricing writes that change a price.
 */
export const PRICING_SNAPSHOT_CACHE = defineCache<
  LocationCacheContext,
  PricingSnapshot
>({
  namespace: CacheNamespace.PRICING_SNAPSHOT,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ brandId, locationId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.serviceCatalog(locationId),
    CacheDependency.staffDirectory(locationId),
    CacheDependency.pricing(locationId),
    CacheDependency.brandProducts(brandId),
    CacheDependency.locationProducts(locationId),
  ],
  policy: CATALOG_CACHE_POLICY,
});
