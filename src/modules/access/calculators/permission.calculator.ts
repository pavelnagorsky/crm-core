import { Injectable } from '@nestjs/common';
import {
  BrandPermissionOverride,
  BusinessRole,
  LocationPermissionOverride,
  UserRole,
} from '@prisma/client';
import { PermissionGrants } from '../interfaces/permission-grants.interface.js';
import { ROLE_BAGS } from '../constants/role-bags.js';
import {
  addGrant,
  removeGrant,
  hasGrant,
  includesAccess,
} from '../utils/permission.js';
import {
  PERMISSION_REGISTRY,
  REGISTERED_PERMISSIONS,
} from '../constants/permission-registry.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
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
  ): PermissionGrants {
    const result: PermissionGrants = {};
    for (const permission of REGISTERED_PERMISSIONS) {
      const definition = PERMISSION_REGISTRY[permission.claim];
      const action = definition.actions[permission.access]!;
      let allowed = ROLE_BAGS[role].some(
        (grant) =>
          grant.claim === permission.claim &&
          includesAccess(grant.access, permission.access),
      );
      if (role !== BusinessRole.OWNER && action.configurable.includes(role)) {
        const matches = (
          row: BrandPermissionOverride | LocationPermissionOverride,
        ) =>
          row.role === role &&
          row.claim === permission.claim &&
          row.access === permission.access;
        const brand = brandOverrides.find(matches);
        const local =
          definition.scope === PermissionScope.LOCATION ||
          definition.scope === PermissionScope.BRAND_OR_LOCATION
            ? locationOverrides.find(matches)
            : undefined;
        allowed = local?.allowed ?? brand?.allowed ?? allowed;
      }
      if (allowed) addGrant(result, permission);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const permission of REGISTERED_PERMISSIONS) {
        if (!hasGrant(result, permission)) continue;
        const action =
          PERMISSION_REGISTRY[permission.claim].actions[permission.access]!;
        if (
          action.dependencies.some((required) => !hasGrant(result, required))
        ) {
          removeGrant(result, permission);
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
      permissions: PermissionGrants,
      scope: Exclude<PermissionScope, PermissionScope.BRAND_OR_LOCATION>,
    ) => {
      const key = `${scope}:${scopeId}` as const;
      const grants = (claims[key] ??= {});
      for (const permission of REGISTERED_PERMISSIONS) {
        const declared = PERMISSION_REGISTRY[permission.claim].scope;
        if (
          hasGrant(permissions, permission) &&
          (declared === scope ||
            (declared === PermissionScope.BRAND_OR_LOCATION &&
              scope !== PermissionScope.SHARED))
        ) {
          addGrant(grants, permission);
        }
      }
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
