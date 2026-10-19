import { ForbiddenException } from '@nestjs/common';
import { BusinessRole, UserRole } from '@prisma/client';
import {
  authorizeTestToken,
  tokenPayload,
} from '../../auth/testing/factories/token-payload.factory.js';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { PermissionValue } from '../enums/permission-value.enum.js';
import { Permission } from '../enums/permission.enum.js';
import { AccessAdministrationService } from './access-administration.service.js';

describe('Access administration', () => {
  const db = {
    accessState: { findUnique: vi.fn() },
    brandPermissionOverride: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    locationPermissionOverride: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    brandMembership: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    locationMembership: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    accessInvitation: { findMany: vi.fn() },
  };
  const access = { recordChange: vi.fn() };
  const service = new AccessAdministrationService(
    db as never,
    access as never,
    new PermissionCalculator(),
    {} as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    db.accessState.findUnique.mockResolvedValue({ revision: 3 });
    db.brandPermissionOverride.findMany.mockResolvedValue([]);
    db.locationPermissionOverride.findMany.mockResolvedValue([]);
    db.brandMembership.findMany.mockResolvedValue([]);
    db.locationMembership.findMany.mockResolvedValue([]);
    db.accessInvitation.findMany.mockResolvedValue([]);
  });

  const changePolicy = (
    changes: Parameters<AccessAdministrationService['changePolicy']>[4],
    locationId: string | undefined = 'location-1',
  ) =>
    service.changePolicy(
      tokenPayload(),
      'brand-1',
      locationId,
      3,
      changes,
      db as never,
    );

  it.each([
    {
      role: BusinessRole.MANAGER,
      permission: Permission.INVENTORY_READ,
      dependent: Permission.INVENTORY_MANAGE,
    },
    {
      role: BusinessRole.STAFF,
      permission: Permission.BOOKING_READ_OWN,
      dependent: Permission.BOOKING_MANAGE_OWN,
    },
  ])(
    'allows disabling $permission without extra changes',
    async ({ role, permission, dependent }) => {
      await changePolicy([{ role, permission, value: PermissionValue.DENY }]);

      expect(db.locationPermissionOverride.upsert).toHaveBeenCalledOnce();
      const saved = {
        id: 'override',
        ...db.locationPermissionOverride.upsert.mock.calls[0][0].create,
      };
      db.locationPermissionOverride.findMany.mockResolvedValue([saved]);
      const policy = await service.describePolicy('brand-1', 'location-1');
      expect(policy.entries).toContainEqual(
        expect.objectContaining({
          role,
          permission: dependent,
          override: null,
          allowed: false,
        }),
      );
      expect(access.recordChange).toHaveBeenCalledOnce();
    },
  );

  it('keeps a dependent ALLOW inactive until reading is restored', async () => {
    const role = BusinessRole.MANAGER;
    const denyRead = {
      id: 'read',
      brandId: 'brand-1',
      role,
      permission: Permission.INVENTORY_READ,
      allowed: false,
    };
    db.brandPermissionOverride.findMany.mockResolvedValue([denyRead]);
    await changePolicy([
      {
        role,
        permission: Permission.INVENTORY_MANAGE,
        value: PermissionValue.ALLOW,
      },
    ]);
    db.locationPermissionOverride.findMany.mockResolvedValue([
      {
        id: 'manage',
        locationId: 'location-1',
        role,
        permission: Permission.INVENTORY_MANAGE,
        allowed: true,
      },
    ]);
    const entry = async () =>
      (await service.describePolicy('brand-1', 'location-1')).entries.find(
        (row) =>
          row.role === role && row.permission === Permission.INVENTORY_MANAGE,
      );

    expect(await entry()).toMatchObject({ override: true, allowed: false });
    db.brandPermissionOverride.findMany.mockResolvedValue([]);
    expect(await entry()).toMatchObject({ override: true, allowed: true });
  });

  it.each([
    { role: BusinessRole.OWNER, permission: Permission.ORDER_RETURN },
    { role: BusinessRole.STAFF, permission: Permission.ORDER_RETURN },
    { role: BusinessRole.MANAGER, permission: Permission.CLIENT_MANAGE },
    { role: BusinessRole.MANAGER, permission: 'unknown' as Permission },
  ])(
    'rejects an invalid local change for $role/$permission before writing',
    async (invalid) => {
      await expect(
        changePolicy([
          {
            role: BusinessRole.MANAGER,
            permission: Permission.ORDER_RETURN,
            value: PermissionValue.DENY,
          },
          { ...invalid, value: PermissionValue.ALLOW },
        ]),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.brandPermissionOverride.upsert).not.toHaveBeenCalled();
      expect(db.locationPermissionOverride.upsert).not.toHaveBeenCalled();
      expect(access.recordChange).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate changes before writing', async () => {
    const change = {
      role: BusinessRole.MANAGER,
      permission: Permission.ORDER_RETURN,
      value: PermissionValue.DENY,
    };
    await expect(changePolicy([change, change])).rejects.toMatchObject({
      status: 400,
    });
    expect(db.locationPermissionOverride.upsert).not.toHaveBeenCalled();
  });

  it.each([undefined, 'location-1'])(
    'rejects enabling invitations while disabling fixed staff reading in scope %s',
    async (locationId) => {
      const owner = authorizeTestToken({
        ...tokenPayload(),
        brandMemberships: [{ brandId: 'brand-1', role: BusinessRole.OWNER }],
      });
      await expect(
        service.changePolicy(
          owner,
          'brand-1',
          locationId,
          3,
          [
            {
              role: BusinessRole.MANAGER,
              permission: Permission.ACCESS_STAFF_MANAGE,
              value: PermissionValue.ALLOW,
            },
            {
              role: BusinessRole.MANAGER,
              permission: Permission.STAFF_READ,
              value: PermissionValue.DENY,
            },
          ],
          db as never,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.brandPermissionOverride.upsert).not.toHaveBeenCalled();
      expect(db.locationPermissionOverride.upsert).not.toHaveBeenCalled();
      expect(access.recordChange).not.toHaveBeenCalled();
    },
  );

  it('rejects an outdated version before writing', async () => {
    db.accessState.findUnique.mockResolvedValue({ revision: 4 });
    await expect(
      changePolicy([
        {
          role: BusinessRole.MANAGER,
          permission: Permission.ORDER_RETURN,
          value: PermissionValue.DENY,
        },
      ]),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.locationPermissionOverride.upsert).not.toHaveBeenCalled();
  });

  it('allows disabling shared reading at brand scope without rewriting dependent actions', async () => {
    const owner = authorizeTestToken({
      ...tokenPayload(),
      brandMemberships: [{ brandId: 'brand-1', role: BusinessRole.OWNER }],
    });
    await service.changePolicy(
      owner,
      'brand-1',
      undefined,
      3,
      [
        {
          role: BusinessRole.MANAGER,
          permission: Permission.SUPPLIER_READ,
          value: PermissionValue.DENY,
        },
      ],
      db as never,
    );

    expect(db.brandPermissionOverride.upsert).toHaveBeenCalledOnce();
    expect(db.locationPermissionOverride.upsert).not.toHaveBeenCalled();
    expect(access.recordChange).toHaveBeenCalledOnce();
  });

  it.each([
    { previous: BusinessRole.MANAGER, next: BusinessRole.STAFF },
    { previous: BusinessRole.STAFF, next: BusinessRole.MANAGER },
  ])(
    'requires authority over both $previous and $next when changing a membership',
    async ({ previous, next }) => {
      db.locationMembership.findFirst.mockResolvedValue({
        id: 'membership',
        role: previous,
        userId: 'employee',
        locationId: 'location-1',
      });
      await expect(
        service.changeMembership(
          tokenPayload(BusinessRole.MANAGER),
          'brand-1',
          'location-1',
          'membership',
          next,
          3,
          db as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.locationMembership.update).not.toHaveBeenCalled();
    },
  );

  it.each([null, BusinessRole.MANAGER])(
    'protects the last brand owner when changing its role to %s',
    async (role) => {
      const owner = authorizeTestToken({
        ...tokenPayload(),
        brandMemberships: [{ brandId: 'brand-1', role: BusinessRole.OWNER }],
      });
      db.brandMembership.findFirst.mockResolvedValue({
        id: 'membership',
        role: BusinessRole.OWNER,
        userId: owner.sub,
        brandId: 'brand-1',
      });
      db.brandMembership.count.mockResolvedValue(1);

      await expect(
        service.changeMembership(
          owner,
          'brand-1',
          undefined,
          'membership',
          role,
          3,
          db as never,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.brandMembership.update).not.toHaveBeenCalled();
      expect(db.brandMembership.delete).not.toHaveBeenCalled();
    },
  );

  it.each(['memberships', 'invitations'] as const)(
    'denies %s without management permissions before querying data',
    async (operation) => {
      await expect(
        service[operation](tokenPayload(BusinessRole.STAFF), 'brand-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.brandMembership.findMany).not.toHaveBeenCalled();
      expect(db.locationMembership.findMany).not.toHaveBeenCalled();
      expect(db.accessInvitation.findMany).not.toHaveBeenCalled();
    },
  );

  it('lists only staff memberships a local manager can administer', async () => {
    const ownStaff = {
      id: 'staff',
      userId: 'employee',
      role: BusinessRole.STAFF,
      locationId: 'location-1',
    };
    db.locationMembership.findMany.mockResolvedValue([
      ownStaff,
      { ...ownStaff, id: 'manager', role: BusinessRole.MANAGER },
      { ...ownStaff, id: 'outside', locationId: 'location-2' },
    ]);
    expect(
      await service.memberships(tokenPayload(BusinessRole.MANAGER), 'brand-1'),
    ).toEqual([{ ...ownStaff, brandId: 'brand-1' }]);
  });

  it('does not expose an invitation with any unmanageable grant', async () => {
    const staffGrant = { role: BusinessRole.STAFF, locationId: 'location-1' };
    const own = { id: 'own', grants: [staffGrant] };
    db.accessInvitation.findMany.mockResolvedValue([
      own,
      {
        id: 'mixed',
        grants: [staffGrant, { ...staffGrant, locationId: 'location-2' }],
      },
      { id: 'owner', grants: [{ ...staffGrant, role: BusinessRole.OWNER }] },
    ]);
    expect(
      await service.invitations(tokenPayload(BusinessRole.MANAGER), 'brand-1'),
    ).toEqual([own]);
  });

  it('accepts platform administrators without business memberships', async () => {
    const admin = authorizeTestToken({
      ...tokenPayload(),
      role: UserRole.ADMIN,
      locationMemberships: [],
    });
    await expect(service.memberships(admin, 'brand-1')).resolves.toEqual([]);
    expect(db.locationMembership.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          location: {
            deletedAt: null,
            brand: { deletedAt: null },
            brandId: 'brand-1',
          },
        },
      }),
    );
    await expect(service.invitations(admin, 'brand-1')).resolves.toEqual([]);
  });
});
