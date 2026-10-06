import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { BusinessRole, UserRole } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

export function assertLocationRole(
  payload: TokenPayloadDto,
  locationId: string,
  ...roles: BusinessRole[]
): void {
  if (payload.role === UserRole.ADMIN) return;

  const locationMembership = payload.locationMemberships?.find(
    (item) => item.locationId === locationId,
  );
  if (!locationMembership) {
    throw new AppException(ErrorCode.TOKEN_PAYLOAD_STALE, HttpStatus.CONFLICT, {
      action: 'REFRESH_ACCESS_TOKEN',
      reason: 'LOCATION_MAPPING_MISSING',
    });
  }

  if (roles.includes(locationMembership.role)) return;

  const brandMembership = payload.brandMemberships?.find(
    (item) => item.brandId === locationMembership.brandId,
  );
  if (brandMembership && roles.includes(brandMembership.role)) return;

  throw new ForbiddenException('Access denied');
}
