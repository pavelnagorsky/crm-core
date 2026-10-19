import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';

export interface PermissionGrants extends Partial<
  Record<Claim, PermissionAccess>
> {}
