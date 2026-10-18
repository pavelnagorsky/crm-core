import { ForbiddenException } from '@nestjs/common';
import { Permission } from '../../access/enums/permission.enum.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { StaffAccessService } from '../../staff/services/staff-access.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingAccessService } from './booking-access.service.js';

describe('Booking access by participation', () => {
  const staff = { resolveOwnProfile: vi.fn() };
  const service = new BookingAccessService(
    new StaffAccessService(staff as never),
  );
  const own = booking({ locationId: 'location-1' });
  const other = booking({
    locationId: 'location-1',
    item: { staffId: 'boris' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    staff.resolveOwnProfile.mockResolvedValue({ id: 'anna' });
  });

  it('allows a participant to read and manage the entire mixed booking', async () => {
    const mixed = { ...own, items: [...other.items, ...own.items] };
    await expect(
      service.assertRead(tokenPayload('STAFF'), mixed),
    ).resolves.toBeUndefined();
    await expect(
      service.assertManage(tokenPayload('STAFF'), mixed),
    ).resolves.toBeUndefined();
    expect(staff.resolveOwnProfile).toHaveBeenCalledWith(
      'location-1',
      'user-1',
    );
  });

  it('rejects reading or editing a booking without participation', async () => {
    await expect(
      service.assertRead(tokenPayload('STAFF'), other),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertManage(tokenPayload('STAFF'), other),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('broadens reading independently from editing', async () => {
    const token = tokenPayload('STAFF');
    token.permissions!['L:location-1'].push(Permission.BOOKING_READ);
    await expect(
      service.readStaffId(token, 'location-1'),
    ).resolves.toBeUndefined();
    await expect(service.assertRead(token, other)).resolves.toBeUndefined();
    await expect(service.assertManage(token, other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uses inherited manager permissions even with a direct staff membership', async () => {
    const token = tokenPayload('STAFF');
    token.brandMemberships = [{ brandId: 'brand-1', role: 'MANAGER' }];
    token.permissions!['L:location-1'].push(
      Permission.BOOKING_READ,
      Permission.BOOKING_MANAGE,
    );
    await expect(service.assertManage(token, other)).resolves.toBeUndefined();
    await expect(
      service.readStaffId(token, 'location-1'),
    ).resolves.toBeUndefined();
    expect(staff.resolveOwnProfile).not.toHaveBeenCalled();
  });

  it('fails closed for a missing active profile and for another location', async () => {
    staff.resolveOwnProfile.mockRejectedValue(new ForbiddenException());
    await expect(
      service.readStaffId(tokenPayload('STAFF'), 'location-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    staff.resolveOwnProfile.mockClear();
    await expect(
      service.readStaffId(tokenPayload('STAFF'), 'other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(staff.resolveOwnProfile).not.toHaveBeenCalled();
  });

  it('revokes own access after all services have been reassigned', async () => {
    await service.assertManage(tokenPayload('STAFF'), own);
    await expect(
      service.assertManage(tokenPayload('STAFF'), other),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps completed bookings immutable for staff while allowing managers to edit', async () => {
    const completed = { ...own, status: BookingStatus.COMPLETED };
    await expect(
      service.assertEdit(tokenPayload('STAFF'), completed),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertEdit(tokenPayload('MANAGER'), completed),
    ).resolves.toBeUndefined();
    await expect(
      service.assertEdit(tokenPayload('STAFF'), own),
    ).resolves.toBeUndefined();
  });
});
