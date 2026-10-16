import { ApiProperty } from '@nestjs/swagger';
import { Staff, UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { AccessScopeResponseDto } from './access-scope-response.dto.js';

export class UserAccessResponseDto {
  @ApiProperty() platformAdmin: boolean;
  @ApiProperty({ type: [AccessScopeResponseDto] })
  scopes: AccessScopeResponseDto[];

  static fromToken(
    token: TokenPayloadDto,
    profiles: Staff[],
  ): UserAccessResponseDto {
    const brandIds = [
      ...new Set([
        ...token.brandMemberships.map((row) => row.brandId),
        ...token.locationMemberships.map((row) => row.brandId),
      ]),
    ];
    return Object.assign(new UserAccessResponseDto(), {
      platformAdmin: token.role === UserRole.ADMIN,
      scopes: [
        ...brandIds.map((brandId) =>
          Object.assign(new AccessScopeResponseDto(), {
            brandId,
            locationId: null,
            directRole:
              token.brandMemberships.find((row) => row.brandId === brandId)
                ?.role ?? null,
            inheritedRole: null,
            staffId: null,
            permissions: token.permissions?.['B:' + brandId] ?? [],
            sharedPermissions: token.permissions?.['G:' + brandId] ?? [],
          }),
        ),
        ...[
          ...new Map(
            token.locationMemberships.map((row) => [row.locationId, row]),
          ).values(),
        ].map((location) =>
          Object.assign(new AccessScopeResponseDto(), {
            brandId: location.brandId,
            locationId: location.locationId,
            directRole:
              token.locationMemberships.find(
                (row) =>
                  row.locationId === location.locationId && !row.inherited,
              )?.role ?? null,
            inheritedRole:
              token.brandMemberships.find(
                (row) => row.brandId === location.brandId,
              )?.role ?? null,
            staffId:
              profiles.find((row) => row.locationId === location.locationId)
                ?.id ?? null,
            permissions: token.permissions?.['L:' + location.locationId] ?? [],
            sharedPermissions: [],
          }),
        ),
      ],
    });
  }
}
