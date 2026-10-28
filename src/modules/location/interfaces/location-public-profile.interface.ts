import { Prisma } from '@prisma/client';
import { BRAND_PROFILE_SELECT } from '../../brand/cache/brand-profile.cache.js';
import { LOCATION_SETTINGS_SELECT } from '../cache/location-settings.cache.js';

export interface LocationPublicProfile extends Prisma.LocationGetPayload<{
  select: typeof LOCATION_SETTINGS_SELECT;
}> {
  brand: Prisma.BrandGetPayload<{ select: typeof BRAND_PROFILE_SELECT }>;
}
