import { UserRole } from '@prisma/client';
import { BrandMembershipPayloadDto } from './brand-membership-payload.dto.js';
import { LocationMembershipPayloadDto } from './location-membership-payload.dto.js';

export class TokenPayloadDto {
  sub: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  brandMemberships: BrandMembershipPayloadDto[];
  locationMemberships: LocationMembershipPayloadDto[];
  tokenEpoch: number;
}

export { assertBrandRole as assertBusinessRole } from '../guards/assert-brand-role.js';
