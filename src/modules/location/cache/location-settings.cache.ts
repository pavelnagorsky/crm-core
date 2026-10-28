import { Prisma } from '@prisma/client';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { SETTINGS_CACHE_POLICY } from '../../../shared/cache/cache-policies.js';
import { defineCache } from '../../../shared/cache/define-cache.js';
import { CacheNamespace } from '../../../shared/cache/enums/cache-namespace.enum.js';

export const LOCATION_SETTINGS_SELECT = {
  id: true,
  brandId: true,
  name: true,
  countryCode: true,
  currency: true,
  timezone: true,
  businessType: true,
  city: true,
  addressLine: true,
  phone: true,
  instagram: true,
  telegram: true,
  whatsapp: true,
  website: true,
  mapWidgetUrl: true,
  advanceBookingWindowDays: true,
  slotIntervalMinutes: true,
  minimumBookingNoticeMinutes: true,
  bookingVisibility: true,
  isBookingConfirmationRequired: true,
} satisfies Prisma.LocationSelect;

export const LOCATION_SETTINGS_CACHE = defineCache<
  { locationId: string },
  Prisma.LocationGetPayload<{ select: typeof LOCATION_SETTINGS_SELECT }>
>({
  namespace: CacheNamespace.LOCATION_SETTINGS,
  identity: ({ locationId }) => [locationId],
  dependencies: ({ locationId }, value) => [
    CacheDependency.locationLifecycle(locationId),
    CacheDependency.locationSettings(locationId),
    ...(value ? [CacheDependency.brandLifecycle(value.brandId)] : []),
  ],
  policy: SETTINGS_CACHE_POLICY,
});
