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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RBAC_ROLES_KEY } from '../../auth/guards/rbac-roles-key.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { SupplierRbacGuard } from '../guards/supplier-rbac.guard.js';

export function SupplierRBAC(...roles: BusinessRole[]) {
  return applyDecorators(
    SetMetadata(RBAC_ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, TokenEpochGuard, SupplierRbacGuard),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      description: 'Unauthorized',
      type: UnauthorizedException,
    }),
    ApiForbiddenResponse({
      description: 'Insufficient brand or location manager role',
      type: ForbiddenException,
    }),
  );
}
