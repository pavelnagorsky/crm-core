import { PermissionClaims } from '../interfaces/permission-claims.interface.js';

export function hasGlobalPermission(
  permissions: PermissionClaims | undefined,
): boolean {
  return permissions?.['*']?.includes('*') ?? false;
}
