import { applyDecorators, ForbiddenException, SetMetadata, UnauthorizedException, UseGuards } from '@nestjs/common';
import { BusinessRole } from '@prisma/client';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RbacGuard } from '../guards/rbac.guard.js';

export const RBAC_ROLES_KEY = 'rbacRoles';

export function RBAC(...roles: BusinessRole[]) {
  return applyDecorators(
    SetMetadata(RBAC_ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RbacGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({ description: 'Unauthorized', type: UnauthorizedException }),
    ApiForbiddenResponse({ description: 'Insufficient business role', type: ForbiddenException }),
  );
}
