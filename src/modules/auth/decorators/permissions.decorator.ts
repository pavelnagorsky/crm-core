import {
  applyDecorators,
  ForbiddenException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { Permission } from '../../access/enums/permission.enum.js';
import {
  PermissionGuard,
  PERMISSIONS_KEY,
} from '../guards/permission.guard.js';
import { Auth } from './auth.decorator.js';

export function Permissions(...permissions: Permission[]) {
  return applyDecorators(
    Auth(),
    SetMetadata(PERMISSIONS_KEY, permissions),
    UseGuards(PermissionGuard),
    ApiForbiddenResponse({
      description: 'Insufficient permissions',
      type: ForbiddenException,
    }),
  );
}
