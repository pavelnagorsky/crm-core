import { BusinessRole, UserRole } from '@prisma/client';
import { PERMISSIONS_VERSION } from '../../../access/constants/permissions-version.js';
import { PermissionCalculator } from '../../../access/calculators/permission.calculator.js';
import { TokenPayloadDto } from '../../dto/token-payload.dto.js';

export function tokenPayload(
  role: BusinessRole = BusinessRole.OWNER,
  locationId = 'location-1',
  brandId = 'brand-1',
): TokenPayloadDto {
  return authorizeTestToken({
    sub: 'user-1',
    role: UserRole.USER,
    tokenEpoch: 0,
    brandMemberships: [],
    locationMemberships: [{ locationId, brandId, role }],
  });
}
export function authorizeTestToken(token: TokenPayloadDto): TokenPayloadDto {
  token = {
    ...token,
    brandMemberships: token.brandMemberships ?? [],
    locationMemberships: token.locationMemberships ?? [],
  };
  const locations = token.locationMemberships.map((row) => ({
    id: row.locationId,
    brandId: row.brandId,
  }));
  return {
    ...token,
    permissionsVersion: PERMISSIONS_VERSION,
    permissions: new PermissionCalculator().claims(
      token.brandMemberships,
      token.locationMemberships,
      locations,
      [],
      [],
      token.role,
    ),
  };
}
