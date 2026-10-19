import { Injectable } from '@nestjs/common';
import {
  BrandPermissionOverride,
  BusinessRole,
  LocationPermissionOverride,
  UserRole,
} from '@prisma/client';
import { PERMISSION_REGISTRY } from '../constants/permission-registry.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { Permission } from '../enums/permission.enum.js';
import { AccessLocation } from '../interfaces/access-location.interface.js';
import { BrandAccessMembership } from '../interfaces/brand-access-membership.interface.js';
import { LocationAccessMembership } from '../interfaces/location-access-membership.interface.js';
import { PermissionClaims } from '../interfaces/permission-claims.interface.js';

@Injectable()
export class PermissionCalculator {
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
        const local =
          definition.scope === PermissionScope.LOCATION ||
          definition.scope === PermissionScope.BRAND_OR_LOCATION
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
    brands: BrandAccessMembership[],
    memberships: LocationAccessMembership[],
    locations: AccessLocation[],
    brandOverrides: BrandPermissionOverride[],
    locationOverrides: LocationPermissionOverride[],
    platformRole: UserRole = UserRole.USER,
  ): PermissionClaims {
    const claims: PermissionClaims =
      platformRole === UserRole.ADMIN ? { '*': ['*'] } : {};
    const add = (
      scopeId: string,
      permissions: Set<Permission>,
      scope: Exclude<PermissionScope, PermissionScope.BRAND_OR_LOCATION>,
    ) => {
      const key = `${scope}:${scopeId}` as const;
      claims[key] = [
        ...new Set([
          ...(claims[key] ?? []),
          ...[...permissions].filter((permission) => {
            const declared = PERMISSION_REGISTRY[permission].scope;
            return (
              declared === scope ||
              (declared === PermissionScope.BRAND_OR_LOCATION &&
                scope !== PermissionScope.SHARED)
            );
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
      add(membership.brandId, permissions, PermissionScope.BRAND);
      add(membership.brandId, permissions, PermissionScope.SHARED);
      for (const location of locations.filter(
        (row) => row.brandId === membership.brandId,
      ))
        add(location.id, permissions, PermissionScope.LOCATION);
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
        membership.brandId,
        this.rolePermissions(membership.role, overrides),
        PermissionScope.SHARED,
      );
      add(
        membership.locationId,
        this.rolePermissions(
          membership.role,
          overrides,
          locationOverrides.filter(
            (row) => row.locationId === membership.locationId,
          ),
        ),
        PermissionScope.LOCATION,
      );
    }
    return claims;
  }
}
