import {
  applyDecorators,
  ForbiddenException,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiForbiddenResponse } from '@nestjs/swagger';
import { Permission } from '../../access/interfaces/permission.interface.js';
import {
  PermissionGuard,
  PERMISSIONS_KEY,
} from '../guards/permission.guard.js';
import { Auth } from './auth.decorator.js';

// Each argument is required; an array accepts any one of its permissions.
export function Permissions(...permissions: (Permission | Permission[])[]) {
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
