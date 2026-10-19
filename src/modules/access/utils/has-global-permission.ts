import { PermissionClaims } from '../interfaces/permission-claims.interface.js';

export function hasGlobalPermission(
  permissions: PermissionClaims | undefined,
): boolean {
  const global = permissions?.['*'];
  return Array.isArray(global) && global.length === 1 && global[0] === '*';
}
