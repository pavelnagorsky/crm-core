import { UserRole } from '@prisma/client';
import { BrandMembershipPayloadDto } from './brand-membership-payload.dto.js';
import { LocationMembershipPayloadDto } from './location-membership-payload.dto.js';
import type { PermissionClaims } from '../../access/interfaces/permission-claims.interface.js';

export class TokenPayloadDto {
  permissions?: PermissionClaims;
  permissionsVersion?: number;
  sub: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  brandMemberships: BrandMembershipPayloadDto[];
  locationMemberships: LocationMembershipPayloadDto[];
  tokenEpoch: number;
}
