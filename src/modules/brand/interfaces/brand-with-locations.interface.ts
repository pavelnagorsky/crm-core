import { Brand, Location } from '@prisma/client';

export interface BrandWithLocations extends Brand {
  locations: Location[];
}
