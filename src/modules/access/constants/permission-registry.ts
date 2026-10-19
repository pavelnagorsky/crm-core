import { BusinessRole } from '@prisma/client';
import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { PermissionActionDefinition } from '../interfaces/permission-action-definition.interface.js';
import { PermissionDefinition } from '../interfaces/permission-definition.interface.js';
import { Permission } from '../interfaces/permission.interface.js';
import { Read } from '../utils/permission.js';

function action(
  configurable: readonly BusinessRole[] = [],
  dependencies: readonly Permission[] = [],
): PermissionActionDefinition {
  return { configurable, dependencies };
}

export const PERMISSION_REGISTRY: Readonly<
  Record<Claim, PermissionDefinition>
> = {
  [Claim.BRAND]: {
    scope: PermissionScope.BRAND,
    actions: {
      [PermissionAccess.READ]: action(),
    },
  },
  [Claim.BRAND_SETTINGS]: {
    scope: PermissionScope.BRAND,
    actions: {
      [PermissionAccess.WRITE]: action(),
    },
  },
  [Claim.LOCATION_CREATE]: {
    scope: PermissionScope.BRAND,
    actions: {
      [PermissionAccess.WRITE]: action(),
    },
  },
  [Claim.LOCATION]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(),
    },
  },
  [Claim.LOCATION_SETTINGS]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(),
    },
  },
  [Claim.ACCESS_STAFF]: {
    scope: PermissionScope.BRAND_OR_LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.STAFF)],
      ),
    },
  },
  [Claim.ACCESS_MANAGER]: {
    scope: PermissionScope.BRAND_OR_LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(),
    },
  },
  [Claim.ACCESS_OWNER]: {
    scope: PermissionScope.BRAND_OR_LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(),
    },
  },
  [Claim.ACCESS_POLICY]: {
    scope: PermissionScope.BRAND_OR_LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(),
    },
  },
  [Claim.CALENDAR_BLOCKS]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.BOOKING)],
      ),
    },
  },
  [Claim.BOOKING]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.STAFF]),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.BOOKING)],
      ),
    },
  },
  [Claim.BOOKING_OWN]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.STAFF]),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.STAFF],
        [Read(Claim.BOOKING_OWN)],
      ),
    },
  },
  [Claim.BOOKING_DELETE]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action([], [Read(Claim.BOOKING)]),
    },
  },
  [Claim.BOOKING_EXPORT]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.BOOKING)],
      ),
    },
  },
  [Claim.BOOKING_CLIENT_TOKEN]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.BOOKING)],
      ),
    },
  },
  [Claim.ORDER]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.ORDER)],
      ),
    },
  },
  [Claim.ORDER_RETURN]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.ORDER)],
      ),
    },
  },
  [Claim.ORDER_VOID]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.ORDER)],
      ),
    },
  },
  [Claim.SALE_PRICE_OVERRIDE]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.WRITE]: action([BusinessRole.MANAGER]),
    },
  },
  [Claim.CLIENT]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.STAFF]),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.CLIENT)],
      ),
    },
  },
  [Claim.CLIENT_BAN]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.CLIENT)],
      ),
    },
  },
  [Claim.CLIENT_IMPORT]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.CLIENT)],
      ),
    },
  },
  [Claim.CLIENT_EXPORT]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.READ]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.CLIENT)],
      ),
    },
  },
  [Claim.PRODUCT_CATALOG]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.READ]: action(),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.PRODUCT_CATALOG)],
      ),
    },
  },
  [Claim.PRODUCT_LOCATION]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.PRODUCT_LOCATION)],
      ),
    },
  },
  [Claim.SERVICE]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.SERVICE)],
      ),
    },
  },
  [Claim.SUPPLIER]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.SUPPLIER)],
      ),
    },
  },
  [Claim.INVENTORY]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.INVENTORY)],
      ),
    },
  },
  [Claim.INVENTORY_EXPORT]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.INVENTORY)],
      ),
    },
  },
  [Claim.STAFF]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.STAFF)],
      ),
    },
  },
  [Claim.STAFF_OWN]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.STAFF]),
    },
  },
  [Claim.STAFF_EXPORT]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.STAFF)],
      ),
    },
  },
  [Claim.PAYROLL]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
      [PermissionAccess.WRITE]: action([], [Read(Claim.PAYROLL)]),
    },
  },
  [Claim.PAYROLL_OWN]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.STAFF]),
    },
  },
  [Claim.PAYROLL_EXPORT]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.PAYROLL)],
      ),
    },
  },
  [Claim.BOOKING_CHANNEL]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
      [PermissionAccess.WRITE]: action(
        [BusinessRole.MANAGER],
        [Read(Claim.BOOKING_CHANNEL)],
      ),
    },
  },
  [Claim.ANALYTICS_LOCATION]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
    },
  },
  [Claim.ANALYTICS_BRAND]: {
    scope: PermissionScope.BRAND,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
    },
  },
  [Claim.AUDIT_LOCATION]: {
    scope: PermissionScope.LOCATION,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
    },
  },
  [Claim.AUDIT_BRAND]: {
    scope: PermissionScope.BRAND,
    actions: {
      [PermissionAccess.READ]: action([BusinessRole.MANAGER]),
    },
  },
  [Claim.FILE_BRAND]: {
    scope: PermissionScope.SHARED,
    actions: {
      [PermissionAccess.WRITE]: action([BusinessRole.MANAGER]),
    },
  },
};

export const REGISTERED_PERMISSIONS = Object.values(Claim).flatMap((claim) =>
  ([PermissionAccess.READ, PermissionAccess.WRITE] as const)
    .filter((access) => !!PERMISSION_REGISTRY[claim].actions[access])
    .map((access) => ({ claim, access })),
);

export function isRegisteredPermission(permission: Permission): boolean {
  if (!permission || !Object.hasOwn(PERMISSION_REGISTRY, permission.claim))
    return false;
  const actions = PERMISSION_REGISTRY[permission.claim].actions;
  return permission.access === PermissionAccess.READ_WRITE
    ? !!actions.read && !!actions.write
    : (permission.access === PermissionAccess.READ ||
        permission.access === PermissionAccess.WRITE) &&
        !!actions[permission.access];
}
