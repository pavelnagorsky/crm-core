import { LocationMembership } from '@prisma/client';

export interface UserLocationMembershipWithBrand extends LocationMembership {
  location: {
    brandId: string;
  };
}
