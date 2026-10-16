import { UserRole } from '@prisma/client';
import { BrandMembershipPayloadDto } from './brand-membership-payload.dto.js';
import { LocationMembershipPayloadDto } from './location-membership-payload.dto.js';
import { Permission } from '../../access/enums/permission.enum.js';

export class TokenPayloadDto {
  permissions?: Record<string, Permission[]>;
  sub: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  brandMemberships: BrandMembershipPayloadDto[];
  locationMemberships: LocationMembershipPayloadDto[];
  tokenEpoch: number;
}
