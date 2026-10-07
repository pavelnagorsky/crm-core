import { User } from '@prisma/client';
import { UserBrandMembershipWithLocations } from './user-brand-membership-with-locations.interface.js';
import { UserLocationMembershipWithBrand } from './user-location-membership-with-brand.interface.js';

export interface UserWithAccessMemberships extends User {
  brandMemberships: UserBrandMembershipWithLocations[];
  locationMemberships: UserLocationMembershipWithBrand[];
}
