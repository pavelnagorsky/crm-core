import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { CATALOG_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { LocationCacheContext } from '../../../shared/cache/interfaces/location-cache-context.interface.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { StaffScheduleSnapshot } from '../interfaces/staff-schedule-snapshot.interface.js';

export const STAFF_SCHEDULE_CACHE = defineCache<
  LocationCacheContext,
  StaffScheduleSnapshot
>({
  namespace: CacheNamespace.STAFF_SCHEDULE,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ brandId, locationId }) => [
    CacheDependency.brandLifecycle(brandId),
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.staffSchedule(locationId),
  ],
  policy: CATALOG_CACHE_POLICY,
  isUsable: (snapshot) =>
    TimeUtils.dateOnlyStr(snapshot.coveredFrom) ===
    TimeUtils.zonedDateStr(new Date(), snapshot.timezone),
});
