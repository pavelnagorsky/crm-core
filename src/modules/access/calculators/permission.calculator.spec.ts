import { BusinessRole, UserRole } from '@prisma/client';
import { REGISTERED_PERMISSIONS } from '../constants/permission-registry.js';
import { Claim } from '../enums/claim.enum.js';
import { Read, Write, hasGrant } from '../utils/permission.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { hasPermission } from '../utils/assert-permission.js';
import { PermissionCalculator } from './permission.calculator.js';

describe('Permissions compiled into JWT', () => {
  const compute = new PermissionCalculator();
  const locations = [
    { id: 'location-1', brandId: 'brand-1' },
    { id: 'location-2', brandId: 'brand-1' },
  ];
  const local = [
    { locationId: 'location-1', brandId: 'brand-1', role: BusinessRole.STAFF },
  ];
  it('gives staff own access without administrative or financial permissions', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    for (const permission of [
      Read(Claim.BOOKING_OWN),
      Write(Claim.BOOKING_OWN),
      Read(Claim.STAFF_OWN),
      Read(Claim.PAYROLL_OWN),
      Read(Claim.LOCATION),
    ])
      expect(hasPermission(token, permission, 'location-1')).toBe(true);
    for (const permission of [
      Read(Claim.BOOKING),
      Write(Claim.BOOKING),
      Read(Claim.ORDER),
      Write(Claim.ORDER),
      Read(Claim.PAYROLL),
      Read(Claim.STAFF),
      Write(Claim.STAFF),
      Write(Claim.SALE_PRICE_OVERRIDE),
      Write(Claim.ORDER_RETURN),
      Write(Claim.ORDER_VOID),
      Write(Claim.CALENDAR_BLOCKS),
      Write(Claim.BOOKING_DELETE),
      Read(Claim.ANALYTICS_LOCATION),
    ])
      expect(hasPermission(token, permission, 'location-1')).toBe(false);
    expect(hasPermission(token, Read(Claim.CLIENT), 'brand-1')).toBe(false);
    expect(hasPermission(token, Read(Claim.PRODUCT_CATALOG), 'brand-1')).toBe(
      true,
    );
    expect(hasPermission(token, Read(Claim.BOOKING_OWN), 'location-2')).toBe(
      false,
    );
  });

  it('allows broader calendar and client reading without broader mutations', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    token.permissions = compute.claims(
      [],
      local,
      locations,
      [
        {
          id: 'clients',
          brandId: 'brand-1',
          role: BusinessRole.STAFF,
          ...Read(Claim.CLIENT),
          allowed: true,
        },
      ],
      [
        {
          id: 'calendar',
          locationId: 'location-1',
          role: BusinessRole.STAFF,
          ...Read(Claim.BOOKING),
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Read(Claim.BOOKING), 'location-1')).toBe(true);
    expect(hasPermission(token, Read(Claim.CLIENT), 'brand-1')).toBe(true);
    expect(hasPermission(token, Write(Claim.BOOKING), 'location-1')).toBe(
      false,
    );
    expect(hasPermission(token, Write(Claim.CLIENT), 'brand-1')).toBe(false);
    expect(hasPermission(token, Read(Claim.CLIENT), 'other')).toBe(false);
  });

  it('ignores obsolete staff overrides for administrative and financial actions', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    const forbidden = [
      Write(Claim.BOOKING),
      Write(Claim.ORDER),
      Read(Claim.ORDER),
      Write(Claim.ORDER_RETURN),
      Write(Claim.ORDER_VOID),
      Write(Claim.SALE_PRICE_OVERRIDE),
      Write(Claim.CALENDAR_BLOCKS),
      Read(Claim.STAFF),
      Write(Claim.STAFF),
      Write(Claim.PAYROLL),
      Read(Claim.PAYROLL),
      Read(Claim.ANALYTICS_LOCATION),
    ];
    token.permissions = compute.claims(
      [],
      local,
      locations,
      forbidden.map((permission) => ({
        id: `${permission.claim}:${permission.access}`,
        brandId: 'brand-1',
        role: BusinessRole.STAFF,
        ...permission,
        allowed: true,
      })),
      forbidden.map((permission) => ({
        id: `${permission.claim}:${permission.access}`,
        locationId: 'location-1',
        role: BusinessRole.STAFF,
        ...permission,
        allowed: true,
      })),
    );
    for (const permission of forbidden)
      expect(hasPermission(token, permission, 'location-1')).toBe(false);
  });

  it('keeps financial management exclusive to owners despite manager overrides', () => {
    const token = tokenPayload(BusinessRole.MANAGER);
    token.permissions = compute.claims(
      [],
      [{ ...local[0], role: BusinessRole.MANAGER }],
      locations,
      [],
      [
        {
          id: 'old',
          locationId: 'location-1',
          role: BusinessRole.MANAGER,
          ...Write(Claim.PAYROLL),
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Read(Claim.PAYROLL), 'location-1')).toBe(true);
    expect(hasPermission(token, Write(Claim.PAYROLL), 'location-1')).toBe(
      false,
    );
    expect(
      hasPermission(
        tokenPayload(BusinessRole.OWNER),
        Write(Claim.PAYROLL),
        'location-1',
      ),
    ).toBe(true);
  });

  it('disables own mutations when own reading is denied', () => {
    const permissions = compute.rolePermissions(BusinessRole.STAFF, [
      {
        id: 'deny',
        brandId: 'brand-1',
        role: BusinessRole.STAFF,
        ...Read(Claim.BOOKING_OWN),
        allowed: false,
      },
    ]);
    expect(hasGrant(permissions, Read(Claim.BOOKING_OWN))).toBe(false);
    expect(hasGrant(permissions, Write(Claim.BOOKING_OWN))).toBe(false);
  });

  it.each(['brand', 'location'] as const)(
    'keeps staff invitations and reading together without profile management for a %s manager',
    (source) => {
      const role = BusinessRole.MANAGER;
      const changes = [
        { ...Write(Claim.ACCESS_STAFF), allowed: true },
        { ...Write(Claim.STAFF), allowed: false },
        { ...Read(Claim.STAFF), allowed: false },
      ];
      const token = tokenPayload(role);
      token.permissions = compute.claims(
        source === 'brand' ? [{ brandId: 'brand-1', role }] : [],
        source === 'location' ? [{ ...local[0], role }] : [],
        locations,
        source === 'brand'
          ? changes.map((change) => ({
              id: `${change.claim}:${change.access}`,
              brandId: 'brand-1',
              role,
              ...change,
            }))
          : [],
        source === 'location'
          ? changes.map((change) => ({
              id: `${change.claim}:${change.access}`,
              locationId: 'location-1',
              role,
              ...change,
            }))
          : [],
      );

      for (const locationId of source === 'brand'
        ? ['location-1', 'location-2']
        : ['location-1']) {
        expect(
          hasPermission(token, Write(Claim.ACCESS_STAFF), locationId, true),
        ).toBe(true);
        expect(hasPermission(token, Read(Claim.STAFF), locationId)).toBe(true);
        expect(hasPermission(token, Write(Claim.STAFF), locationId)).toBe(
          false,
        );
      }
      if (source === 'location') {
        expect(
          hasPermission(token, Write(Claim.ACCESS_STAFF), 'location-2', true),
        ).toBe(false);
        expect(hasPermission(token, Read(Claim.STAFF), 'location-2')).toBe(
          false,
        );
      }
    },
  );

  it.each([BusinessRole.MANAGER, BusinessRole.STAFF])(
    'keeps booking deletion unavailable to %s despite stored overrides',
    (role) => {
      const token = tokenPayload(role);
      token.permissions = compute.claims(
        [],
        [{ ...local[0], role }],
        locations,
        [],
        [
          {
            id: 'old-booking-delete',
            locationId: 'location-1',
            role,
            ...Write(Claim.BOOKING_DELETE),
            allowed: true,
          },
        ],
      );
      expect(
        hasPermission(token, Write(Claim.BOOKING_DELETE), 'location-1'),
      ).toBe(false);
      expect(
        hasPermission(
          tokenPayload(BusinessRole.OWNER),
          Write(Claim.BOOKING_DELETE),
          'location-1',
        ),
      ).toBe(true);
    },
  );
  it('combines inherited manager and direct owner without widening local ownership', () => {
    const token = tokenPayload();
    token.permissions = compute.claims(
      [{ brandId: 'brand-1', role: BusinessRole.MANAGER }],
      [{ ...local[0], role: BusinessRole.OWNER }],
      locations,
      [],
      [],
    );
    expect(
      hasPermission(token, Write(Claim.LOCATION_SETTINGS), 'location-1'),
    ).toBe(true);
    expect(
      hasPermission(token, Write(Claim.LOCATION_SETTINGS), 'location-2'),
    ).toBe(false);
    expect(hasPermission(token, Write(Claim.ORDER_RETURN), 'location-2')).toBe(
      true,
    );
    expect(hasPermission(token, Write(Claim.ACCESS_OWNER), 'brand-1')).toBe(
      false,
    );
  });
  it('applies a local deny only to the local source', () => {
    const overrides = [
      {
        id: 'o',
        locationId: 'location-1',
        role: BusinessRole.MANAGER,
        ...Write(Claim.ORDER_RETURN),
        allowed: false,
      },
    ];
    const token = tokenPayload();
    token.permissions = compute.claims(
      [{ brandId: 'brand-1', role: BusinessRole.MANAGER }],
      [{ ...local[0], role: BusinessRole.MANAGER }],
      locations,
      [],
      overrides,
    );
    expect(hasPermission(token, Write(Claim.ORDER_RETURN), 'location-1')).toBe(
      true,
    );
    token.permissions = compute.claims(
      [],
      [{ ...local[0], role: BusinessRole.MANAGER }],
      locations,
      [],
      overrides,
    );
    expect(hasPermission(token, Write(Claim.ORDER_RETURN), 'location-1')).toBe(
      false,
    );
  });
  it('ignores forbidden overrides and brand STAFF while resolving dependencies', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    token.permissions = compute.claims(
      [],
      local,
      locations,
      [
        {
          id: 'o',
          brandId: 'brand-1',
          role: BusinessRole.STAFF,
          ...Read(Claim.ORDER),
          allowed: false,
        },
      ],
      [
        {
          id: 'bad',
          locationId: 'location-1',
          role: BusinessRole.STAFF,
          ...Read(Claim.PAYROLL),
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Write(Claim.ORDER_RETURN), 'location-1')).toBe(
      false,
    );
    expect(hasPermission(token, Read(Claim.PAYROLL), 'location-1')).toBe(false);
    token.permissions = compute.claims(
      [{ brandId: 'brand-1', role: BusinessRole.STAFF }],
      [],
      locations,
      [],
      [],
    );
    expect(hasPermission(token, Read(Claim.CLIENT), 'brand-1')).toBe(false);
  });
  it('uses signed claims directly and fails closed for missing or unknown claims', () => {
    const token = tokenPayload();
    delete token.permissions;
    expect(hasPermission(token, Read(Claim.ORDER), 'location-1')).toBe(false);
    token.role = UserRole.ADMIN;
    expect(hasPermission(token, Read(Claim.ORDER), 'location-1')).toBe(false);
    expect(hasPermission(token, Read('unknown' as Claim), 'location-1')).toBe(
      false,
    );
  });

  it('grants global access only to platform administrators when compiling claims', () => {
    expect(compute.claims([], [], [], [], [], UserRole.ADMIN)).toEqual({
      '*': ['*'],
    });
    expect(compute.claims([], [], [], [], [], UserRole.USER)).toEqual({});
    expect(tokenPayload(BusinessRole.OWNER).permissions).not.toHaveProperty(
      '*',
    );
  });

  it('authorizes every registered permission in any scope using the global claim alone', () => {
    const token = tokenPayload();
    token.brandMemberships = [];
    token.locationMemberships = [];
    token.permissions = compute.claims([], [], [], [], [], UserRole.ADMIN);
    for (const permission of REGISTERED_PERMISSIONS) {
      expect(hasPermission(token, permission, 'unrelated-brand')).toBe(true);
      expect(hasPermission(token, permission, 'new-location', true)).toBe(true);
    }
    for (const permission of ['unknown', '*', 'toString', '__proto__'])
      expect(
        hasPermission(token, Read(permission as Claim), 'location-1'),
      ).toBe(false);
  });

  it('does not treat a scoped wildcard or a partial global grant as universal access', () => {
    const token = tokenPayload();
    for (const permissions of [
      { 'L:location-1': ['*'] },
      { '*': [Read(Claim.ORDER)] },
      { '*': [] },
    ]) {
      token.permissions = permissions as never;
      expect(hasPermission(token, Read(Claim.ORDER), 'location-1')).toBe(false);
    }
  });
});
