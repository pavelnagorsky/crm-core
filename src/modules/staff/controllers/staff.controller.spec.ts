import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
  const controller = new StaffController(
    staff as never,
    {} as never,
    new StaffAccessService(staff as never),
  );

  beforeEach(() => vi.clearAllMocks());

  it('returns colleague names without contact, tax or payout details', async () => {
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
      },
    ]);
    const result = await controller.directory('location-1');
    expect(result.responseValue).toEqual([
      { id: 'boris', name: 'Boris', roleTitle: 'Stylist', status: 'ACTIVE' },
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
