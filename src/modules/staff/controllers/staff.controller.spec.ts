import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Claim } from '../../access/enums/claim.enum.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { StaffAccessService } from '../services/staff-access.service.js';
import { StaffController } from './staff.controller.js';

describe('Staff directory and private data', () => {
  const staff = {
    listInLocation: vi.fn(),
    resolveOwnProfile: vi.fn().mockResolvedValue({ id: 'anna' }),
    findWithServiceCountInLocation: vi.fn(),
    getShifts: vi.fn(),
  };
  const reviews = { getStaffSummaries: vi.fn() };
  const controller = new StaffController(
    staff as never,
    {} as never,
    new StaffAccessService(staff as never),
    reviews as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    reviews.getStaffSummaries.mockResolvedValue(new Map());
  });

  it('returns colleague names without contact, tax or payout details', async () => {
    reviews.getStaffSummaries.mockResolvedValue(
      new Map([['boris', { count: 4, average: 4.5 }]]),
    );
    staff.listInLocation.mockResolvedValue([
      {
        id: 'boris',
        name: 'Boris',
        roleTitle: 'Stylist',
        status: 'ACTIVE',
        phone: 'private',
        email: 'private',
        taxId: 'private',
        payoutNote: 'private',
        avatarFile: {
          id: 'file-1',
          fileName: 'boris.png',
          url: 'https://cdn.example/boris.png',
        },
        reviewSummary: { count: 4, average: 4.5 },
      },
      {
        id: 'anna',
        name: 'Anna',
        roleTitle: null,
        status: 'ACTIVE',
        avatarFile: null,
      },
    ]);
    const result = await controller.directory('location-1');
    expect(result.responseValue).toEqual([
      {
        id: 'boris',
        name: 'Boris',
        roleTitle: 'Stylist',
        status: 'ACTIVE',
        avatar: {
          id: 'file-1',
          name: 'boris.png',
          url: 'https://cdn.example/boris.png',
        },
        reviewSummary: { count: 4, average: 4.5 },
      },
      {
        id: 'anna',
        name: 'Anna',
        roleTitle: null,
        status: 'ACTIVE',
        avatar: null,
        reviewSummary: null,
      },
    ]);
    expect(reviews.getStaffSummaries).toHaveBeenCalledWith('location-1', [
      'boris',
      'anna',
    ]);
  });

  it('rejects direct access to another staff profile or shifts', async () => {
    await expect(
      controller.findById('location-1', 'boris', tokenPayload('STAFF')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.getShifts(
        'location-1',
        'boris',
        { from: '2026-10-01', to: '2026-10-02' },
        tokenPayload('STAFF'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(staff.findWithServiceCountInLocation).not.toHaveBeenCalled();
    expect(staff.getShifts).not.toHaveBeenCalled();
  });

  it('keeps the full staff list closed', () => {
    const context = {
      getHandler: () => StaffController.prototype.search,
      getClass: () => StaffController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: tokenPayload('STAFF'),
          params: { locationId: 'location-1' },
        }),
      }),
    } as unknown as ExecutionContext;
    expect(() =>
      new PermissionGuard(new Reflector()).canActivate(context),
    ).toThrow(ForbiddenException);
  });
});

describe('Staff price level needs pricing:write', () => {
  const staff = {
    create: vi.fn().mockResolvedValue({ id: 'anna' }),
    update: vi.fn().mockResolvedValue({ id: 'anna' }),
    findWithServiceCountInLocation: vi.fn(),
  };
  const controller = new StaffController(
    staff as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const owner = tokenPayload('OWNER');
  /** Edits staff, cannot touch prices. */
  const withoutPricing = {
    ...owner,
    permissions: {
      ...owner.permissions,
      'L:location-1': {
        ...(owner.permissions as Record<string, Record<string, string>>)[
          'L:location-1'
        ],
        [Claim.PRICING]: undefined,
      },
    },
  } as typeof owner;
  const create = { name: 'Anna' };

  beforeEach(() => {
    vi.clearAllMocks();
    staff.create.mockResolvedValue({ id: 'anna' });
    staff.update.mockResolvedValue({ id: 'anna' });
    staff.findWithServiceCountInLocation.mockResolvedValue({
      id: 'anna',
      priceLevelId: 'level-1',
    });
  });

  it('rejects a new staff member with a price level without pricing:write', async () => {
    await expect(
      controller.create(
        'location-1',
        { ...create, priceLevelId: 'level-1' } as never,
        withoutPricing,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(staff.create).not.toHaveBeenCalled();
  });

  it('creates without a level or with pricing:write', async () => {
    await controller.create('location-1', create as never, withoutPricing);
    await controller.create(
      'location-1',
      { ...create, priceLevelId: 'level-1' } as never,
      owner,
    );
    expect(staff.create).toHaveBeenCalledTimes(2);
  });

  it('rejects changing the level without pricing:write', async () => {
    await expect(
      controller.update(
        'location-1',
        'anna',
        { priceLevelId: 'level-2' } as never,
        withoutPricing,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.update(
        'location-1',
        'anna',
        { priceLevelId: null } as never,
        withoutPricing,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(staff.update).not.toHaveBeenCalled();
  });

  it('lets a staff edit keep the level or leave it out without pricing:write', async () => {
    await controller.update(
      'location-1',
      'anna',
      { priceLevelId: 'level-1', name: 'Anna B' } as never,
      withoutPricing,
    );
    await controller.update(
      'location-1',
      'anna',
      { name: 'Anna C' } as never,
      withoutPricing,
    );
    expect(staff.update).toHaveBeenCalledTimes(2);
  });

  it('changes the level with pricing:write', async () => {
    await controller.update(
      'location-1',
      'anna',
      { priceLevelId: 'level-2' } as never,
      owner,
    );
    expect(staff.update).toHaveBeenCalledOnce();
  });
});
