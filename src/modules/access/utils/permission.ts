import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { Permission } from '../interfaces/permission.interface.js';
import { PermissionGrants } from '../interfaces/permission-grants.interface.js';

export function Read(claim: Claim): Permission {
  return { claim, access: PermissionAccess.READ };
}

export function Write(claim: Claim): Permission {
  return { claim, access: PermissionAccess.WRITE };
}

export function ReadWrite(claim: Claim): Permission {
  return { claim, access: PermissionAccess.READ_WRITE };
}

export function includesAccess(
  granted: PermissionAccess | undefined,
  required: PermissionAccess,
): boolean {
  return (
    Object.values(PermissionAccess).includes(required) &&
    (granted === required || granted === PermissionAccess.READ_WRITE)
  );
}

export function hasGrant(
  grants: PermissionGrants,
  permission: Permission,
): boolean {
  return (
    Object.hasOwn(grants, permission.claim) &&
    includesAccess(grants[permission.claim], permission.access)
  );
}

export function addGrant(
  grants: PermissionGrants,
  permission: Permission,
): void {
  const previous = grants[permission.claim];
  grants[permission.claim] =
    previous && previous !== permission.access
      ? PermissionAccess.READ_WRITE
      : permission.access;
}

export function removeGrant(
  grants: PermissionGrants,
  permission: Permission,
): void {
  const current = grants[permission.claim];
  if (!current) return;
  if (
    current === PermissionAccess.READ_WRITE &&
    permission.access !== PermissionAccess.READ_WRITE
  ) {
    grants[permission.claim] =
      permission.access === PermissionAccess.READ
        ? PermissionAccess.WRITE
        : PermissionAccess.READ;
  } else if (
    current === permission.access ||
    permission.access === PermissionAccess.READ_WRITE
  ) {
    delete grants[permission.claim];
  }
}
