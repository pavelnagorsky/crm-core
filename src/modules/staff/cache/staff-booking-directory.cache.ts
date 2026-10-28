import { Prisma } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { CATALOG_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { LocationCacheContext } from '../../../shared/cache/interfaces/location-cache-context.interface.js';
import { PUBLIC_FILE_SELECT } from '../../../shared/database/public-file.select.js';

export const STAFF_BOOKING_SELECT = {
  id: true,
  name: true,
  roleTitle: true,
  description: true,
  avatarFile: { select: PUBLIC_FILE_SELECT },
  staffServices: { select: { serviceId: true } },
} satisfies Prisma.StaffSelect;

export const STAFF_BOOKING_DIRECTORY_CACHE = defineCache<
  LocationCacheContext,
  Prisma.StaffGetPayload<{ select: typeof STAFF_BOOKING_SELECT }>[]
>({
  namespace: CacheNamespace.STAFF_BOOKING_DIRECTORY,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ brandId, locationId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.staffDirectory(locationId),
  ],
  policy: CATALOG_CACHE_POLICY,
});
