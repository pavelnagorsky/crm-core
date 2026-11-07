import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';
import { PUBLIC_BOOKING_PAGE_LIST_TTL_SECONDS } from '../constants/public-booking-page-list.constants.js';
import { PublicBookingPageListEntry } from '../interfaces/public-booking-page-list-entry.interface.js';

// Location/brand deactivation and visibility changes are not tracked per id here,
// so the short TTL bounds how long such pages can linger in the list.
const PUBLIC_BOOKING_PAGE_LIST_POLICY = {
  ttlMs: PUBLIC_BOOKING_PAGE_LIST_TTL_SECONDS * 1000,
  refreshAheadMs: 60_000,
};

// The whole list is cached under one key so arbitrary `page` values cannot
// grow the cache; pagination is applied to the cached array.
export const PUBLIC_BOOKING_PAGE_LIST_CACHE = defineCache<
  Record<string, never>,
  PublicBookingPageListEntry[]
>({
  namespace: CacheNamespace.PUBLIC_BOOKING_PAGE_LIST,
  identity: () => ['all'],
  dependencies: () => [CacheDependency.publicBookingPages()],
  policy: PUBLIC_BOOKING_PAGE_LIST_POLICY,
});
