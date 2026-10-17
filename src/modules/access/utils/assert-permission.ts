import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PERMISSION_REGISTRY } from '../constants/permission-registry.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { Permission } from '../enums/permission.enum.js';

export function hasPermission(
  token: TokenPayloadDto | undefined,
  permission: Permission,
  scopeId: string,
  locationScope = false,
): boolean {
  const definition = PERMISSION_REGISTRY[permission];
  if (!token || !definition) return false;
  if (token.role === UserRole.ADMIN) return true;
  const scope =
    definition.scope === PermissionScope.BRAND_OR_LOCATION
      ? locationScope
        ? PermissionScope.LOCATION
        : PermissionScope.BRAND
      : definition.scope;
  return (
    token.permissions?.[scope + ':' + scopeId]?.includes(permission) ?? false
  );
}

export function assertPermission(
  token: TokenPayloadDto | undefined,
  permission: Permission,
  scopeId: string,
  locationScope = false,
): void {
  if (!hasPermission(token, permission, scopeId, locationScope))
    throw new ForbiddenException('Access denied');
}
