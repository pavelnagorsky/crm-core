import { StaffStatus, UserRole } from '@prisma/client';
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

  it('does not invalidate unrelated access when deactivation revokes no STAFF membership', async () => {
    access.revokeStaffAccess.mockResolvedValue(false);

    await revoke('deactivate');

    expect(epochs.bump).not.toHaveBeenCalled();
    expect(transactionCompleted).toBe(true);
  });
});
