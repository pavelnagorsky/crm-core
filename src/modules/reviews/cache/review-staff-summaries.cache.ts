import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { SETTINGS_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { ReviewSummary } from '../interfaces/review-summary.interface.js';

/** Summaries of every reviewed master of a location, keyed by staff id. */
export const REVIEW_STAFF_SUMMARIES_CACHE = defineCache<
  { locationId: string },
  Record<string, ReviewSummary>
>({
  namespace: CacheNamespace.REVIEW_STAFF_SUMMARIES,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ locationId }) => [
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.locationReviews(locationId),
  ],
  policy: SETTINGS_CACHE_POLICY,
});
