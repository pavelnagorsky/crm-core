import { CacheDependency } from '../../../../shared/cache/cache-dependency.js';
import { CATALOG_CACHE_POLICY } from '../../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../../shared/cache/enums/cache-namespace.enum.js';
import { LocationCacheContext } from '../../../../shared/cache/interfaces/location-cache-context.interface.js';
import { BookingCatalogSnapshot } from '../interfaces/booking-catalog-snapshot.interface.js';

export const SERVICE_CATALOG_CACHE = defineCache<
  LocationCacheContext,
  BookingCatalogSnapshot
>({
  namespace: CacheNamespace.SERVICE_CATALOG,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ brandId, locationId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.serviceCatalog(locationId),
  ],
  policy: CATALOG_CACHE_POLICY,
});
