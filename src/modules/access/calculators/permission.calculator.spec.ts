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
  it('gives staff operational defaults and shared reads within its scopes', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    for (const permission of [
      Permission.BOOKING_MANAGE,
      Permission.BOOKING_READ,
      Permission.ORDER_MANAGE,
    ])
      expect(hasPermission(token, permission, 'location-1')).toBe(true);
    for (const permission of [
      Permission.PAYROLL_READ,
      Permission.STAFF_MANAGE,
      Permission.LOCATION_SETTINGS_MANAGE,
      Permission.SALE_PRICE_OVERRIDE,
      Permission.ORDER_RETURN,
      Permission.ORDER_VOID,
      Permission.CALENDAR_BLOCKS_MANAGE,
      Permission.BOOKING_DELETE,
    ])
      expect(hasPermission(token, permission, 'location-1')).toBe(false);
    expect(hasPermission(token, Permission.CLIENT_READ, 'brand-1')).toBe(true);
    expect(hasPermission(token, Permission.CLIENT_MANAGE, 'brand-1')).toBe(
      false,
    );
    expect(hasPermission(token, Permission.PRODUCT_READ, 'brand-1')).toBe(true);
    expect(hasPermission(token, Permission.ORDER_READ, 'location-2')).toBe(
      false,
    );
    expect(hasPermission(token, Permission.CLIENT_READ, 'other')).toBe(false);
  });
  it('delegates returns independently from annulling a whole order', () => {
    const token = tokenPayload(BusinessRole.STAFF);
    token.permissions = compute.claims(
      [],
      local,
      locations,
      [],
      [
        {
          id: 'return-only',
          locationId: 'location-1',
          role: BusinessRole.STAFF,
          permission: Permission.ORDER_RETURN,
          allowed: true,
        },
      ],
    );
    expect(hasPermission(token, Permission.ORDER_RETURN, 'location-1')).toBe(
      true,
    );
    expect(hasPermission(token, Permission.ORDER_VOID, 'location-1')).toBe(
      false,
    );
  });
  it('allows owners to delegate returns, voids and calendar blocks to staff explicitly', () => {
    const permissions = [
      Permission.ORDER_RETURN,
      Permission.ORDER_VOID,
      Permission.CALENDAR_BLOCKS_MANAGE,
    ];
    const token = tokenPayload(BusinessRole.STAFF);
    token.permissions = compute.claims(
      [],
      local,
      locations,
      [],
      permissions.map((permission) => ({
        id: permission,
        locationId: 'location-1',
        role: BusinessRole.STAFF,
        permission,
        allowed: true,
      })),
    );
    for (const permission of permissions)
      expect(hasPermission(token, permission, 'location-1')).toBe(true);
  });

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
