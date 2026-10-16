import { BusinessRole, UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../../src/modules/auth/dto/token-payload.dto.js';
import { PermissionComputeService } from '../../src/modules/access/services/permission-compute.service.js';

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
    permissions: new PermissionComputeService().claims(
      token.brandMemberships,
      token.locationMemberships,
      locations,
      [],
      [],
    ),
  };
}
