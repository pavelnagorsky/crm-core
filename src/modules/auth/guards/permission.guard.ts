import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../../access/interfaces/permission.interface.js';
import {
  PERMISSION_REGISTRY,
  isRegisteredPermission,
} from '../../access/constants/permission-registry.js';
import { PermissionScope } from '../../access/enums/permission-scope.enum.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';

export const PERMISSIONS_KEY = 'access:permissions';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<
      (Permission | Permission[])[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (!permissions?.length)
      throw new ForbiddenException('Permission metadata is required');
    for (const requirement of permissions) {
      const alternatives = Array.isArray(requirement)
        ? requirement
        : [requirement];
      const allowed = alternatives.some((permission) => {
        if (!isRegisteredPermission(permission)) return false;
        const scope = PERMISSION_REGISTRY[permission.claim].scope;
        const local =
          scope === PermissionScope.LOCATION ||
          (scope === PermissionScope.BRAND_OR_LOCATION &&
            !!request.params.locationId);
        const scopeId = local
          ? request.params.locationId
          : request.params.brandId;
        return (
          !!scopeId && hasPermission(request.user, permission, scopeId, local)
        );
      });
      if (!allowed) throw new ForbiddenException('Access denied');
    }
    return true;
  }
}
