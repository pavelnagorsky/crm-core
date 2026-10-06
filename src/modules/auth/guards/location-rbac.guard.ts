import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole } from '@prisma/client';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';
import { assertLocationRole } from './assert-location-role.js';
import { RBAC_ROLES_KEY } from './rbac-roles-key.js';

@Injectable()
export class LocationRbacGuard implements CanActivate {
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

    const locationId = request.params.locationId;
    if (!locationId) throw new ForbiddenException('Access denied');

    assertLocationRole(payload, locationId, ...requiredRoles);
    return true;
  }
}
