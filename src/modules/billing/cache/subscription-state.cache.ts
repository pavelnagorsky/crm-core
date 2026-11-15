import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { BILLING_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { SubscriptionSnapshot } from '../interfaces/subscription-snapshot.interface.js';

/** Subscription row with its plan and open request. "No row" is cached too. */
export const SUBSCRIPTION_STATE_CACHE = defineCache<
  { brandId: string },
  SubscriptionSnapshot
>({
  namespace: CacheNamespace.SUBSCRIPTION_STATE,
  identity: ({ brandId }) => [brandId],
  dependencies: ({ brandId }) => [
    CacheDependency.subscription(brandId),
    CacheDependency.brandLifecycle(brandId),
  ],
  policy: BILLING_CACHE_POLICY,
});
