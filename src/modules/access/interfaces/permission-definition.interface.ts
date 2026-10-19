import { PermissionScope } from '../enums/permission-scope.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionActionDefinition } from './permission-action-definition.interface.js';

export interface PermissionDefinition {
  scope: PermissionScope;
  actions: Partial<
    Record<
      PermissionAccess.READ | PermissionAccess.WRITE,
      PermissionActionDefinition
    >
  >;
}
