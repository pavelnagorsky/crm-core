import { BrandMembership } from '@prisma/client';

export interface AccessMembership extends BrandMembership {
  locationId: string | null;
}
