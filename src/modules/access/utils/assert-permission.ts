import { ForbiddenException } from '@nestjs/common';
import { Permission } from '../interfaces/permission.interface.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import {
  PERMISSION_REGISTRY,
  isRegisteredPermission,
} from '../constants/permission-registry.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { hasGrant } from './permission.js';
import { hasGlobalPermission } from './has-global-permission.js';

export function hasPermission(
  token: TokenPayloadDto | undefined,
  permission: Permission,
  scopeId: string,
  locationScope = false,
): boolean {
  if (!token || !scopeId || !isRegisteredPermission(permission)) return false;
  const definition = PERMISSION_REGISTRY[permission.claim];
  if (hasGlobalPermission(token.permissions)) return true;
  const scope =
    definition.scope === PermissionScope.BRAND_OR_LOCATION
      ? locationScope
        ? PermissionScope.LOCATION
        : PermissionScope.BRAND
      : definition.scope;
  const grants = token.permissions?.[`${scope}:${scopeId}`];
  return !!grants && !Array.isArray(grants) && hasGrant(grants, permission);
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
