import { Injectable } from '@nestjs/common';
import {
  BrandPermissionOverride,
  BusinessRole,
  LocationPermissionOverride,
} from '@prisma/client';
import { BrandMembershipPayloadDto } from '../../auth/dto/brand-membership-payload.dto.js';
import { LocationMembershipPayloadDto } from '../../auth/dto/location-membership-payload.dto.js';
import { PERMISSION_REGISTRY } from '../constants/permission-registry.js';
import { Permission } from '../enums/permission.enum.js';
import { AccessLocation } from '../interfaces/access-location.interface.js';

@Injectable()
export class PermissionComputeService {
  rolePermissions(
    role: BusinessRole,
    brandOverrides: BrandPermissionOverride[],
    locationOverrides: LocationPermissionOverride[] = [],
  ): Set<Permission> {
    const result = new Set<Permission>();
    for (const permission of Object.values(Permission)) {
      const definition = PERMISSION_REGISTRY[permission];
      let allowed = definition.defaults.includes(role);
      if (
        role !== BusinessRole.OWNER &&
        definition.configurable.includes(role)
      ) {
        const brand = brandOverrides.find(
          (row) => row.role === role && row.permission === permission,
        );
        const local = ['L', 'B/L'].includes(definition.scope)
          ? locationOverrides.find(
              (row) => row.role === role && row.permission === permission,
            )
          : undefined;
        allowed = local?.allowed ?? brand?.allowed ?? allowed;
      }
      if (allowed) result.add(permission);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const permission of result) {
        if (
          PERMISSION_REGISTRY[permission].dependencies.some(
            (required) => !result.has(required),
          )
        ) {
          result.delete(permission);
          changed = true;
        }
      }
    }
    return result;
  }

  claims(
    brands: BrandMembershipPayloadDto[],
    memberships: LocationMembershipPayloadDto[],
    locations: AccessLocation[],
    brandOverrides: BrandPermissionOverride[],
    locationOverrides: LocationPermissionOverride[],
  ): Record<string, Permission[]> {
    const claims: Record<string, Permission[]> = {};
    const add = (
      key: string,
      permissions: Set<Permission>,
      scope: 'B' | 'G' | 'L',
    ) => {
      claims[key] = [
        ...new Set([
          ...(claims[key] ?? []),
          ...[...permissions].filter((permission) => {
            const declared = PERMISSION_REGISTRY[permission].scope;
            return declared === scope || (declared === 'B/L' && scope !== 'G');
          }),
        ]),
      ];
    };
    for (const membership of brands) {
      if (membership.role === BusinessRole.STAFF) continue;
      const permissions = this.rolePermissions(
        membership.role,
        brandOverrides.filter((row) => row.brandId === membership.brandId),
      );
      add('B:' + membership.brandId, permissions, 'B');
      add('G:' + membership.brandId, permissions, 'G');
      for (const location of locations.filter(
        (row) => row.brandId === membership.brandId,
      ))
        add('L:' + location.id, permissions, 'L');
    }
    for (const membership of memberships.filter((row) => !row.inherited)) {
      if (
        !locations.some(
          (row) =>
            row.id === membership.locationId &&
            row.brandId === membership.brandId,
        )
      )
        continue;
      const overrides = brandOverrides.filter(
        (row) => row.brandId === membership.brandId,
      );
      add(
        'G:' + membership.brandId,
        this.rolePermissions(membership.role, overrides),
        'G',
      );
      add(
        'L:' + membership.locationId,
        this.rolePermissions(
          membership.role,
          overrides,
          locationOverrides.filter(
            (row) => row.locationId === membership.locationId,
          ),
        ),
        'L',
      );
    }
    return claims;
  }
}
