import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { BILLING_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { BillingPlanWithPrices } from '../interfaces/billing-plan-with-prices.interface.js';

/** Every plan with every price version of every country. Current prices are computed on read. */
export const BILLING_PLANS_CACHE = defineCache<
  Record<string, never>,
  BillingPlanWithPrices[]
>({
  namespace: CacheNamespace.BILLING_PLANS,
  identity: () => ['all'],
  dependencies: () => [CacheDependency.billingPlans()],
  policy: BILLING_CACHE_POLICY,
});
