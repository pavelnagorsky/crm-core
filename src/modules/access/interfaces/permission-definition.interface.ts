import { BusinessRole } from '@prisma/client';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { Permission } from '../enums/permission.enum.js';
export interface PermissionDefinition {
  scope: PermissionScope;
  defaults: readonly BusinessRole[];
  configurable: readonly BusinessRole[];
  dependencies: readonly Permission[];
}
