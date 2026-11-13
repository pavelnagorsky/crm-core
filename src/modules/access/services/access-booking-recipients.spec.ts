import { BusinessRole } from '@prisma/client';
import { Claim } from '../enums/claim.enum.js';
import { PermissionScope } from '../enums/permission-scope.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { AccessService } from './access.service.js';

describe('AccessService.bookingNotificationRecipients', () => {
  const db = {
    location: { findFirst: vi.fn() },
    locationMembership: { findMany: vi.fn() },
    brandMembership: { findMany: vi.fn() },
  };
  const users = { findAccessParticipants: vi.fn() };
  const service = new AccessService(
    db as never,
    {} as never,
    {} as never,
    users as never,
  );
  const scope = `${PermissionScope.LOCATION}:loc` as const;
  const grants: Record<string, Partial<Record<Claim, PermissionAccess>>> = {
    'manager-local': { [Claim.BOOKING]: PermissionAccess.READ_WRITE },
    'manager-brand': { [Claim.BOOKING]: PermissionAccess.READ_WRITE },
    'manager-revoked': {},
    'staff-own': { [Claim.BOOKING_OWN]: PermissionAccess.READ_WRITE },
    'staff-gone': {},
  };

  beforeEach(() => {
    vi.resetAllMocks();
    db.location.findFirst.mockResolvedValue({ brandId: 'brand' });
    db.locationMembership.findMany.mockResolvedValue([
      { userId: 'manager-local' },
      { userId: 'manager-revoked' },
    ]);
    db.brandMembership.findMany.mockResolvedValue([
      { userId: 'manager-brand' },
      { userId: 'manager-local' },
    ]);
    vi.spyOn(service, 'resolvePermissions').mockImplementation(
      async (userId) => ({ permissions: { [scope]: grants[userId] } }) as never,
    );
    users.findAccessParticipants.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({ id })),
    );
  });

  it('takes managers of the location and the brand plus staff who still see bookings, once each', async () => {
    const recipients = await service.bookingNotificationRecipients('loc', [
      'staff-own',
      'staff-gone',
      'manager-local',
    ]);
    expect(recipients.map((user) => user.id).sort()).toEqual([
      'manager-brand',
      'manager-local',
      'staff-own',
    ]);
    expect(db.locationMembership.findMany).toHaveBeenCalledWith({
      where: { locationId: 'loc', role: BusinessRole.MANAGER },
      select: { userId: true },
    });
    expect(db.brandMembership.findMany).toHaveBeenCalledWith({
      where: { brandId: 'brand', role: BusinessRole.MANAGER },
      select: { userId: true },
    });
  });

  it('notifies nobody for a deleted location', async () => {
    db.location.findFirst.mockResolvedValue(null);
    await expect(
      service.bookingNotificationRecipients('loc', ['staff-own']),
    ).resolves.toEqual([]);
    expect(users.findAccessParticipants).not.toHaveBeenCalled();
  });
});
