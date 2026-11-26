import { PriceChangeCatalog } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';

/**
 * The caches an applied or rolled back change of the catalog makes stale, next to
 * `pricing(locationId)`: the service catalog or the location products.
 */
export function priceChangeCatalogCache(
  catalog: PriceChangeCatalog,
  locationId: string,
): ReturnType<typeof CacheDependency.pricing> {
  return catalog === PriceChangeCatalog.PRODUCTS
    ? CacheDependency.locationProducts(locationId)
    : CacheDependency.serviceCatalog(locationId);
}
