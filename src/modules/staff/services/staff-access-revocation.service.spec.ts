import { BusinessRole, StaffStatus, UserRole } from '@prisma/client';
import { AccessService } from '../../access/services/access.service.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { StaffService } from './staff.service.js';

describe('Staff access revocation transaction', () => {
  const staff = {
    id: 'staff-1',
    userId: 'user-1',
    locationId: 'location-1',
    status: StaffStatus.ACTIVE,
  };
  const tx = {
    staff: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    staffShift: { deleteMany: vi.fn() },
    locationMembership: { deleteMany: vi.fn() },
    accessInvitation: { updateMany: vi.fn() },
  };
  const db = {
    staff: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  const access = { lockBrand: vi.fn(), revokeStaffAccess: vi.fn() };
  const epochs = { bump: vi.fn() };
  const events = { emit: vi.fn() };
  const service = new StaffService(
    db as never,
    events as never,
    { findById: vi.fn().mockResolvedValue({ brandId: 'brand-1' }) } as never,
    access as never,
    { findById: vi.fn().mockResolvedValue({ role: UserRole.USER }) } as never,
    epochs as never,
    { invalidate: vi.fn() } as never,
  );
  const actor = { id: 'owner-1', name: 'Owner', role: AuditActorRole.OWNER };
  let transactionActive: boolean;
  let transactionCompleted: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    transactionActive = false;
    transactionCompleted = false;
    db.staff.findFirst.mockResolvedValue(staff);
    tx.staff.findUniqueOrThrow.mockResolvedValue(staff);
    access.revokeStaffAccess.mockResolvedValue(true);
    db.$transaction.mockImplementation(async (operation) => {
      transactionActive = true;
      try {
        const result = await operation(tx);
        transactionCompleted = true;
        return result;
      } finally {
        transactionActive = false;
      }
    });
    epochs.bump.mockImplementation(async (_userId, client) => {
      expect(client).toBe(tx);
      expect(transactionActive).toBe(true);
      return 1;
    });
  });

  const revoke = (operation: 'deactivate' | 'delete') =>
    operation === 'deactivate'
      ? service.changeStatus(
          'location-1',
          'staff-1',
          { status: StaffStatus.INACTIVE },
          actor,
        )
      : service.delete('location-1', 'staff-1', actor);

  it.each(['deactivate', 'delete'] as const)(
    'invalidates JWT in the same transaction used to %s the profile',
    async (operation) => {
      await revoke(operation);

      expect(access.revokeStaffAccess).toHaveBeenCalledWith(
        'brand-1',
        'location-1',
        'staff-1',
        'user-1',
        tx,
        actor.id,
      );
      expect(epochs.bump).toHaveBeenCalledExactlyOnceWith('user-1', tx);
      expect(transactionCompleted).toBe(true);
    },
  );

  it.each(['deactivate', 'delete'] as const)(
    'rejects the %s transaction if token invalidation fails',
    async (operation) => {
      const failure = new Error('Epoch update failed');
      epochs.bump.mockRejectedValue(failure);

      await expect(revoke(operation)).rejects.toBe(failure);

      expect(epochs.bump).toHaveBeenCalledExactlyOnceWith('user-1', tx);
      expect(transactionCompleted).toBe(false);
      expect(events.emit).not.toHaveBeenCalled();
    },
  );

  it('releases the binding and invalidates tokens even when deactivation revokes no STAFF membership', async () => {
    access.revokeStaffAccess.mockResolvedValue(false);

    await revoke('deactivate');

    expect(tx.staff.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { locationId: 'location-1', userId: 'user-1' },
      data: { userId: null },
    });
    expect(epochs.bump).toHaveBeenCalledExactlyOnceWith('user-1', tx);
    expect(transactionCompleted).toBe(true);
  });

  it.each([BusinessRole.MANAGER, BusinessRole.OWNER])(
    'releases the binding on deactivation while preserving local %s access',
    async (role) => {
      const membership = { locationId: 'location-1', userId: 'user-1', role };
      let memberships = [membership];
      const accessService = new AccessService({} as never, {} as never);
      vi.spyOn(accessService, 'lockBrand').mockResolvedValue(undefined);
      vi.spyOn(accessService, 'recordChange').mockResolvedValue({} as never);
      access.revokeStaffAccess.mockImplementationOnce(
        accessService.revokeStaffAccess.bind(accessService),
      );
      tx.locationMembership.deleteMany.mockImplementationOnce(({ where }) => {
        const previousCount = memberships.length;
        memberships = memberships.filter(
          (item) =>
            item.locationId !== where.locationId ||
            item.userId !== where.userId ||
            item.role !== where.role,
        );
        return { count: previousCount - memberships.length };
      });

      await revoke('deactivate');

      expect(memberships).toEqual([membership]);
      expect(tx.staff.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { locationId: 'location-1', userId: 'user-1' },
        data: { userId: null },
      });
      expect(tx.accessInvitation.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          brandId: 'brand-1',
          acceptedAt: null,
          revokedAt: null,
          grants: { some: { staffId: 'staff-1' } },
        },
        data: { revokedAt: expect.any(Date) },
      });
      expect(epochs.bump).toHaveBeenCalledExactlyOnceWith('user-1', tx);
      expect(transactionCompleted).toBe(true);
    },
  );

  it('does not invalidate tokens when deactivating an unbound profile', async () => {
    tx.staff.findUniqueOrThrow.mockResolvedValue({ ...staff, userId: null });
    access.revokeStaffAccess.mockResolvedValue(false);

    await revoke('deactivate');

    expect(tx.staff.updateMany).not.toHaveBeenCalled();
    expect(epochs.bump).not.toHaveBeenCalled();
    expect(transactionCompleted).toBe(true);
  });
});
