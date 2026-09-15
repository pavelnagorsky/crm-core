import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole, UserRole } from '@prisma/client';
import { RBAC_ROLES_KEY } from '../decorators/rbac.decorator.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<BusinessRole[]>(RBAC_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: TokenPayloadDto; params: Record<string, string> }>();
    const payload = request.user;

    if (!payload) throw new UnauthorizedException();

    if (payload.role === UserRole.ADMIN) return true;

    const businessId: string | undefined = request.params['businessId'];
    if (!businessId) throw new ForbiddenException('Access denied');

    const membership = payload.memberships?.find((m) => m.businessId === businessId);
    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
