import { BusinessRole } from '@prisma/client';

export class LocationMembershipPayloadDto {
  inherited?: boolean;
  locationId: string;
  brandId: string;
  role: BusinessRole;
}
