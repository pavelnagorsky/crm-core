import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { CATALOG_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { BrandProductCatalog } from '../interfaces/brand-product-catalog.interface.js';

export const BRAND_PRODUCT_CATALOG_CACHE = defineCache<
  { brandId: string },
  BrandProductCatalog
>({
  namespace: CacheNamespace.BRAND_PRODUCT_CATALOG,
  identity: ({ brandId }) => [brandId],
  dependencies: ({ brandId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.brandProducts(brandId),
  ],
  policy: CATALOG_CACHE_POLICY,
});
