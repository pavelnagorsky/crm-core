import { ApiProperty } from '@nestjs/swagger';
import { Staff } from '@prisma/client';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import type { PermissionClaims } from '../interfaces/permission-claims.interface.js';
import { AccessScopeResponseDto } from './access-scope-response.dto.js';

export class UserAccessResponseDto {
  @ApiProperty({
    type: 'object',
    description:
      'Claim-to-access maps keyed by B:<brandId>, G:<brandId>, or L:<locationId>. The global grant { "*": ["*"] } allows every registered permission in every scope.',
    properties: {
      '*': {
        type: 'array',
        items: { type: 'string', enum: ['*'] },
        minItems: 1,
        maxItems: 1,
      },
    },
    additionalProperties: {
      type: 'object',
      additionalProperties: {
        type: 'string',
        enum: Object.values(PermissionAccess),
      },
    },
    example: { '*': ['*'] },
  })
  permissions: PermissionClaims;
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
      permissions: token.permissions ?? {},
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
            permissions:
              token.permissions?.[`${PermissionScope.BRAND}:${brandId}`] ?? {},
            sharedPermissions:
              token.permissions?.[`${PermissionScope.SHARED}:${brandId}`] ?? {},
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
            permissions:
              token.permissions?.[
                `${PermissionScope.LOCATION}:${location.locationId}`
              ] ?? {},
            sharedPermissions: {},
          }),
        ),
      ],
    });
  }
}
