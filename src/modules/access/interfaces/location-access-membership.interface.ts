import { BusinessRole } from '@prisma/client';

export interface LocationAccessMembership {
  locationId: string;
  brandId: string;
  role: BusinessRole;
  inherited?: boolean;
}
