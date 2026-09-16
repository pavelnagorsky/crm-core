import { ForbiddenException } from '@nestjs/common';
import { BusinessRole, UserRole } from '@prisma/client';

export class MembershipPayloadDto {
  businessId: string;
  role: BusinessRole;
}

export class TokenPayloadDto {
  sub: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  memberships: MembershipPayloadDto[];
}

export function assertBusinessRole(payload: TokenPayloadDto, businessId: string, ...roles: BusinessRole[]): void {
  if (payload.role === UserRole.ADMIN) return;
  const membership = payload.memberships?.find((m) => m.businessId === businessId);
  if (!membership || !roles.includes(membership.role)) throw new ForbiddenException('Access denied');
}
