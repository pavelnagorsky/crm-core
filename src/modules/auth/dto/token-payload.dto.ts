import { BusinessRole } from '@prisma/client';

export class MembershipPayloadDto {
  businessId: string;
  role: BusinessRole;
}

export class TokenPayloadDto {
  sub: string;
  memberships: MembershipPayloadDto[];
}
