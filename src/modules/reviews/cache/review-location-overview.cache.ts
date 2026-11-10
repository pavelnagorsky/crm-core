import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { SETTINGS_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { ReviewLocationOverview } from '../interfaces/review-location-overview.interface.js';

export const REVIEW_LOCATION_OVERVIEW_CACHE = defineCache<
  { locationId: string },
  ReviewLocationOverview
>({
  namespace: CacheNamespace.REVIEW_LOCATION_OVERVIEW,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ locationId }) => [
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.locationReviews(locationId),
  ],
  policy: SETTINGS_CACHE_POLICY,
});
