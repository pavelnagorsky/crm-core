import { ForbiddenException } from '@nestjs/common';
import { Permission } from '../../access/enums/permission.enum.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { StaffAccessService } from './staff-access.service.js';
import { StaffService } from './staff.service.js';

describe('Own staff data access', () => {
  const db = { staff: { findFirst: vi.fn() } };
  const staff = new StaffService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const service = new StaffAccessService(staff);

  beforeEach(() => {
    vi.clearAllMocks();
    db.staff.findFirst.mockResolvedValue({ id: 'anna' });
  });

  it('resolves an active profile within the authenticated user and location', async () => {
    await expect(
      service.resolveStaffId(
        tokenPayload('STAFF'),
        'location-1',
        Permission.STAFF_READ,
        Permission.STAFF_READ_OWN,
      ),
    ).resolves.toBe('anna');
    expect(db.staff.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        locationId: 'location-1',
        userId: 'user-1',
        status: 'ACTIVE',
      }),
    });
  });

  it('fails closed when the profile is missing or inactive', async () => {
    db.staff.findFirst.mockResolvedValue(null);
    await expect(
      service.resolveStaffId(
        tokenPayload('STAFF'),
        'location-1',
        Permission.STAFF_READ,
        Permission.STAFF_READ_OWN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies another employee profile and shifts', async () => {
    await expect(
      service.assertStaff(
        tokenPayload('STAFF'),
        'location-1',
        'boris',
        Permission.STAFF_READ,
        Permission.STAFF_READ_OWN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertStaff(
        tokenPayload('STAFF'),
        'location-1',
        'anna',
        Permission.STAFF_READ,
        Permission.STAFF_READ_OWN,
      ),
    ).resolves.toBeUndefined();
  });

  it('allows managers to work without a linked staff profile', async () => {
    await expect(
      service.assertStaff(
        tokenPayload('MANAGER'),
        'location-1',
        'boris',
        Permission.STAFF_READ,
        Permission.STAFF_READ_OWN,
      ),
    ).resolves.toBeUndefined();
    expect(db.staff.findFirst).not.toHaveBeenCalled();
  });
});
