import { BusinessRole, UserRole } from '@prisma/client';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { Permission } from '../enums/permission.enum.js';
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
      Permission.BOOKING_READ_OWN,
      Permission.BOOKING_MANAGE_OWN,
      Permission.STAFF_READ_OWN,
      Permission.PAYROLL_READ_OWN,
      Permission.LOCATION_READ,
    ])
      expect(hasPermission(token, permission, 'location-1')).toBe(true);
    for (const permission of [
      Permission.BOOKING_READ,
      Permission.BOOKING_MANAGE,
      Permission.ORDER_READ,
      Permission.ORDER_MANAGE,
      Permission.PAYROLL_READ,
      Permission.STAFF_READ,
      Permission.STAFF_MANAGE,
      Permission.SALE_PRICE_OVERRIDE,
      Permission.ORDER_RETURN,
      Permission.ORDER_VOID,
      Permission.CALENDAR_BLOCKS_MANAGE,
      Permission.BOOKING_DELETE,
      Permission.ANALYTICS_LOCATION_READ,
    ])
      expect(hasPermission(token, permission, 'location-1')).toBe(false);
    expect(hasPermission(token, Permission.CLIENT_READ, 'brand-1')).toBe(false);
    expect(hasPermission(token, Permission.PRODUCT_READ, 'brand-1')).toBe(true);
    expect(
      hasPermission(token, Permission.BOOKING_READ_OWN, 'location-2'),
    ).toBe(false);
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
          permission: Permission.CLIENT_READ,
          allowed: true,
        },
      ],
      [
        {
          id: 'calendar',
          locationId: 'location-1',
          role: BusinessRole.STAFF,
          permission: Permission.BOOKING_READ,
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Permission.BOOKING_READ, 'location-1')).toBe(
      true,
    );
    expect(hasPermission(token, Permission.CLIENT_READ, 'brand-1')).toBe(true);
    expect(hasPermission(token, Permission.BOOKING_MANAGE, 'location-1')).toBe(
      false,
    );
    expect(hasPermission(token, Permission.CLIENT_MANAGE, 'brand-1')).toBe(
      false,
    );
    expect(hasPermission(token, Permission.CLIENT_READ, 'other')).toBe(false);
  });

  it('ignores obsolete staff overrides for administrative and financial actions', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    const forbidden = [
      Permission.BOOKING_MANAGE,
      Permission.ORDER_MANAGE,
      Permission.ORDER_READ,
      Permission.ORDER_RETURN,
      Permission.ORDER_VOID,
      Permission.SALE_PRICE_OVERRIDE,
      Permission.CALENDAR_BLOCKS_MANAGE,
      Permission.STAFF_READ,
      Permission.STAFF_MANAGE,
      Permission.PAYROLL_MANAGE,
      Permission.PAYROLL_READ,
      Permission.ANALYTICS_LOCATION_READ,
    ];
    token.permissions = compute.claims(
      [],
      local,
      locations,
      forbidden.map((permission) => ({
        id: permission,
        brandId: 'brand-1',
        role: BusinessRole.STAFF,
        permission,
        allowed: true,
      })),
      forbidden.map((permission) => ({
        id: permission,
        locationId: 'location-1',
        role: BusinessRole.STAFF,
        permission,
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
          permission: Permission.PAYROLL_MANAGE,
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Permission.PAYROLL_READ, 'location-1')).toBe(
      true,
    );
    expect(hasPermission(token, Permission.PAYROLL_MANAGE, 'location-1')).toBe(
      false,
    );
    expect(
      hasPermission(
        tokenPayload(BusinessRole.OWNER),
        Permission.PAYROLL_MANAGE,
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
        permission: Permission.BOOKING_READ_OWN,
        allowed: false,
      },
    ]);
    expect(permissions.has(Permission.BOOKING_READ_OWN)).toBe(false);
    expect(permissions.has(Permission.BOOKING_MANAGE_OWN)).toBe(false);
  });

  it.each(['brand', 'location'] as const)(
    'keeps staff invitations and reading together without profile management for a %s manager',
    (source) => {
      const role = BusinessRole.MANAGER;
      const changes = [
        { permission: Permission.ACCESS_STAFF_MANAGE, allowed: true },
        { permission: Permission.STAFF_MANAGE, allowed: false },
        { permission: Permission.STAFF_READ, allowed: false },
      ];
      const token = tokenPayload(role);
      token.permissions = compute.claims(
        source === 'brand' ? [{ brandId: 'brand-1', role }] : [],
        source === 'location' ? [{ ...local[0], role }] : [],
        locations,
        source === 'brand'
          ? changes.map((change) => ({
              id: change.permission,
              brandId: 'brand-1',
              role,
              ...change,
            }))
          : [],
        source === 'location'
          ? changes.map((change) => ({
              id: change.permission,
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
          hasPermission(
            token,
            Permission.ACCESS_STAFF_MANAGE,
            locationId,
            true,
          ),
        ).toBe(true);
        expect(hasPermission(token, Permission.STAFF_READ, locationId)).toBe(
          true,
        );
        expect(hasPermission(token, Permission.STAFF_MANAGE, locationId)).toBe(
          false,
        );
      }
      if (source === 'location') {
        expect(
          hasPermission(
            token,
            Permission.ACCESS_STAFF_MANAGE,
            'location-2',
            true,
          ),
        ).toBe(false);
        expect(hasPermission(token, Permission.STAFF_READ, 'location-2')).toBe(
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
            permission: Permission.BOOKING_DELETE,
            allowed: true,
          },
        ],
      );
      expect(
        hasPermission(token, Permission.BOOKING_DELETE, 'location-1'),
      ).toBe(false);
      expect(
        hasPermission(
          tokenPayload(BusinessRole.OWNER),
          Permission.BOOKING_DELETE,
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
      hasPermission(token, Permission.LOCATION_SETTINGS_MANAGE, 'location-1'),
    ).toBe(true);
    expect(
      hasPermission(token, Permission.LOCATION_SETTINGS_MANAGE, 'location-2'),
    ).toBe(false);
    expect(hasPermission(token, Permission.ORDER_RETURN, 'location-2')).toBe(
      true,
    );
    expect(
      hasPermission(token, Permission.ACCESS_OWNER_MANAGE, 'brand-1'),
    ).toBe(false);
  });
  it('applies a local deny only to the local source', () => {
    const overrides = [
      {
        id: 'o',
        locationId: 'location-1',
        role: BusinessRole.MANAGER,
        permission: Permission.ORDER_RETURN,
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
    expect(hasPermission(token, Permission.ORDER_RETURN, 'location-1')).toBe(
      true,
    );
    token.permissions = compute.claims(
      [],
      [{ ...local[0], role: BusinessRole.MANAGER }],
      locations,
      [],
      overrides,
    );
    expect(hasPermission(token, Permission.ORDER_RETURN, 'location-1')).toBe(
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
          permission: Permission.ORDER_READ,
          allowed: false,
        },
      ],
      [
        {
          id: 'bad',
          locationId: 'location-1',
          role: BusinessRole.STAFF,
          permission: Permission.PAYROLL_READ,
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Permission.ORDER_RETURN, 'location-1')).toBe(
      false,
    );
    expect(hasPermission(token, Permission.PAYROLL_READ, 'location-1')).toBe(
      false,
    );
    token.permissions = compute.claims(
      [{ brandId: 'brand-1', role: BusinessRole.STAFF }],
      [],
      locations,
      [],
      [],
    );
    expect(hasPermission(token, Permission.CLIENT_READ, 'brand-1')).toBe(false);
  });
  it('uses signed claims directly and fails closed for missing or unknown claims', () => {
    const token = tokenPayload();
    delete token.permissions;
    expect(hasPermission(token, Permission.ORDER_READ, 'location-1')).toBe(
      false,
    );
    token.role = UserRole.ADMIN;
    expect(hasPermission(token, Permission.ORDER_READ, 'location-1')).toBe(
      true,
    );
    expect(hasPermission(token, 'unknown' as Permission, 'location-1')).toBe(
      false,
    );
  });
});
