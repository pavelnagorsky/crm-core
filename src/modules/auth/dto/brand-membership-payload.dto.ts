import { BusinessRole } from '@prisma/client';

export class BrandMembershipPayloadDto {
  brandId: string;
  role: BusinessRole;
}
