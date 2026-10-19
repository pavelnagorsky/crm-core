import { PermissionScope } from '../enums/permission-scope.enum.js';
import { Permission } from '../enums/permission.enum.js';

export interface PermissionClaims {
  '*'?: ['*'];
  [
    scope: `${Exclude<PermissionScope, PermissionScope.BRAND_OR_LOCATION>}:${string}`
  ]: Permission[];
}
