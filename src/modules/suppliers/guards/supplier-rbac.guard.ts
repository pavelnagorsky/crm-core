import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole } from '@prisma/client';
import { assertBrandRole } from '../../auth/guards/assert-brand-role.js';
import { RBAC_ROLES_KEY } from '../../auth/guards/rbac-roles-key.js';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface.js';

@Injectable()
export class SupplierRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<BusinessRole[]>(
      RBAC_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = request.user;
    if (!payload) throw new UnauthorizedException();

    const brandId = request.params.brandId;
    if (!brandId) throw new ForbiddenException('Access denied');

    if (
      requiredRoles.includes(BusinessRole.MANAGER) &&
      payload.locationMemberships?.some(
        (membership) =>
          membership.brandId === brandId &&
          membership.role === BusinessRole.MANAGER,
      )
    ) {
      return true;
    }

    assertBrandRole(payload, brandId, ...requiredRoles);
    return true;
  }
}
