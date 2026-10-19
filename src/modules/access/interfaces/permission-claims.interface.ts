import { PermissionScope } from '../enums/permission-scope.enum.js';
import { PermissionGrants } from './permission-grants.interface.js';

export interface PermissionClaims {
  '*'?: ['*'];
  [
    scope: `${Exclude<PermissionScope, PermissionScope.BRAND_OR_LOCATION>}:${string}`
  ]: PermissionGrants;
}
