import { Prisma } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { CATALOG_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { LocationCacheContext } from '../../../shared/cache/interfaces/location-cache-context.interface.js';
import { PUBLIC_PRODUCT_OFFER_SELECT } from '../constants/public-product.select.js';

export const LOCATION_PRODUCT_OFFERS_CACHE = defineCache<
  LocationCacheContext,
  Prisma.ProductLocationGetPayload<{
    select: typeof PUBLIC_PRODUCT_OFFER_SELECT;
  }>[]
>({
  namespace: CacheNamespace.LOCATION_PRODUCT_OFFERS,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ brandId, locationId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.locationProducts(locationId),
  ],
  policy: CATALOG_CACHE_POLICY,
});
