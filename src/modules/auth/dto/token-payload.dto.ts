import { BusinessRole, UserRole } from '@prisma/client';

export class MembershipPayloadDto {
  businessId: string;
  role: BusinessRole;
}

export class TokenPayloadDto {
  sub: string;
  role: UserRole;
  memberships: MembershipPayloadDto[];
}
