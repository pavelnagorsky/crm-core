import { ForbiddenException } from '@nestjs/common';
import { BusinessRole, UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

export function assertBrandRole(
  payload: TokenPayloadDto,
  brandId: string,
  ...roles: BusinessRole[]
): void {
  if (payload.role === UserRole.ADMIN) return;

  const membership = payload.brandMemberships?.find(
    (item) => item.brandId === brandId,
  );
  if (!membership || !roles.includes(membership.role))
    throw new ForbiddenException('Access denied');
}
