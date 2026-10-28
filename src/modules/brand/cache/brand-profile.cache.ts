import { Prisma } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { SETTINGS_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { PUBLIC_FILE_SELECT } from '../../../shared/database/public-file.select.js';

export const BRAND_PROFILE_SELECT = {
  id: true,
  name: true,
  logoFile: { select: PUBLIC_FILE_SELECT },
} satisfies Prisma.BrandSelect;

export const BRAND_PROFILE_CACHE = defineCache<
  { brandId: string },
  Prisma.BrandGetPayload<{ select: typeof BRAND_PROFILE_SELECT }>
>({
  namespace: CacheNamespace.BRAND_PROFILE,
  identity: ({ brandId }) => [brandId],
  dependencies: ({ brandId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.brandProfile(brandId),
  ],
  policy: SETTINGS_CACHE_POLICY,
});
