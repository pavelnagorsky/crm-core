import { BillingSettings } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { BILLING_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';

export const BILLING_SETTINGS_CACHE = defineCache<
  Record<string, never>,
  BillingSettings
>({
  namespace: CacheNamespace.BILLING_SETTINGS,
  identity: () => ['1'],
  dependencies: () => [CacheDependency.billingSettings()],
  policy: BILLING_CACHE_POLICY,
});
