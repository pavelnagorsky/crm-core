import { BrandMembership } from '@prisma/client';

export interface UserBrandMembershipWithLocations extends BrandMembership {
  brand: {
    locations: {
      id: string;
    }[];
  };
}
