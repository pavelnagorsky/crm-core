import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_REGISTRY } from '../../access/constants/permission-registry.js';
import { Permission } from '../../access/enums/permission.enum.js';
import { assertPermission } from '../../access/utils/assert-permission.js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';

export const PERMISSIONS_KEY = 'access:permissions';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (!permissions?.length)
      throw new ForbiddenException('Permission metadata is required');
    for (const permission of permissions) {
      const scope = PERMISSION_REGISTRY[permission]?.scope;
      const local =
        scope === 'L' || (scope === 'B/L' && !!request.params.locationId);
      const scopeId = local
        ? request.params.locationId
        : request.params.brandId;
      if (!scope || !scopeId)
        throw new ForbiddenException('Permission scope is required');
      assertPermission(request.user, permission, scopeId, local);
    }
    return true;
  }
}
