import { Claim } from '../../access/enums/claim.enum.js';
import { Permission } from '../../access/interfaces/permission.interface.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { Read, Write } from '../../access/utils/permission.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';

/** Who may create a manual booking in a location: they pick or add the client while booking. */
export const MANUAL_BOOKING_CREATORS: readonly Permission[] = [
  Write(Claim.BOOKING),
  Write(Claim.BOOKING_OWN),
];

/**
 * Brand clients are readable with client:read, or by anyone who can create a manual booking
 * in one of the brand's locations: the booking dialog searches and shows brand clients.
 */
export function canReadBrandClients(
  token: TokenPayloadDto,
  brandId: string,
): boolean {
  if (hasPermission(token, Read(Claim.CLIENT), brandId)) return true;
  return token.locationMemberships.some(
    (membership) =>
      membership.brandId === brandId &&
      MANUAL_BOOKING_CREATORS.some((permission) =>
        hasPermission(token, permission, membership.locationId),
      ),
  );
}
