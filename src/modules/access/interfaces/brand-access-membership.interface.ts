import { BusinessRole } from '@prisma/client';

export interface BrandAccessMembership {
  brandId: string;
  role: BusinessRole;
}
