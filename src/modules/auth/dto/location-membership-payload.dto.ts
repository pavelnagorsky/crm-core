import { BusinessRole } from '@prisma/client';

export class LocationMembershipPayloadDto {
  locationId: string;
  brandId: string;
  role: BusinessRole;
}
