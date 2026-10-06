import {
  applyDecorators,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TokenEpochGuard } from '../guards/token-epoch.guard.js';
import { BrandRbacGuard } from '../guards/brand-rbac.guard.js';
import { RBAC_ROLES_KEY } from '../guards/rbac-roles-key.js';

export function BrandRBAC(...roles: BusinessRole[]) {
  return applyDecorators(
    SetMetadata(RBAC_ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, TokenEpochGuard, BrandRbacGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description: 'Unauthorized',
      type: UnauthorizedException,
    }),
    ApiForbiddenResponse({
      description: 'Insufficient brand role',
      type: ForbiddenException,
    }),
  );
}
