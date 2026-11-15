import { BrandPermissionOverride, BusinessRole } from '@prisma/client';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { PERMISSION_REGISTRY } from './permission-registry.js';
import { ROLE_BAGS } from './role-bags.js';

function override(
  role: BusinessRole,
  access: PermissionAccess,
): BrandPermissionOverride {
  return {
    id: `override-${role}-${access}`,
    brandId: 'brand-1',
    role,
    claim: Claim.BILLING,
    access,
    allowed: true,
  };
}

describe('Claim.BILLING', () => {
  const calculator = new PermissionCalculator();

  it('is brand-scoped with READ and WRITE that no role can be granted by policy', () => {
    const definition = PERMISSION_REGISTRY[Claim.BILLING];
    expect(definition.scope).toBe(PermissionScope.BRAND);
    expect(Object.keys(definition.actions).sort()).toEqual([
      PermissionAccess.READ,
      PermissionAccess.WRITE,
    ]);
    for (const action of Object.values(definition.actions)) {
      expect(action.configurable).toEqual([]);
      expect(action.dependencies).toEqual([]);
    }
  });

  it('is in the OWNER bag only', () => {
    const holders = Object.values(BusinessRole).filter((role) =>
      ROLE_BAGS[role].some((p) => p.claim === Claim.BILLING),
    );
    expect(holders).toEqual([BusinessRole.OWNER]);
    expect(
      calculator.rolePermissions(BusinessRole.OWNER, [])[Claim.BILLING],
    ).toBe(PermissionAccess.READ_WRITE);
  });

  it('cannot be given to a manager or staff by a brand override', () => {
    for (const role of [BusinessRole.MANAGER, BusinessRole.STAFF]) {
      const overrides = [
        override(role, PermissionAccess.READ),
        override(role, PermissionAccess.WRITE),
      ];
      expect(
        calculator.rolePermissions(role, overrides)[Claim.BILLING],
      ).toBeUndefined();
    }
  });

  it('appears only in the brand claims of a brand owner', () => {
    const claims = calculator.claims(
      [
        { brandId: 'brand-1', role: BusinessRole.OWNER },
        { brandId: 'brand-2', role: BusinessRole.MANAGER },
      ],
      [{ locationId: 'loc-3', brandId: 'brand-3', role: BusinessRole.OWNER }],
      [
        { id: 'loc-1', brandId: 'brand-1' },
        { id: 'loc-2', brandId: 'brand-2' },
        { id: 'loc-3', brandId: 'brand-3' },
      ],
      [],
      [],
    );

    const holders = Object.entries(claims)
      .filter(([, grants]) => Claim.BILLING in (grants as object))
      .map(([key]) => key);
    expect(holders).toEqual(['B:brand-1']);
    expect(claims['B:brand-1']?.[Claim.BILLING]).toBe(
      PermissionAccess.READ_WRITE,
    );
  });
});
