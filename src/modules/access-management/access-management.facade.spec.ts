import { ForbiddenException } from '@nestjs/common';
import { BusinessRole, UserRole } from '@prisma/client';
import { PermissionValue } from '../access/enums/permission-value.enum.js';
import { Permission } from '../access/enums/permission.enum.js';
import { tokenPayload } from '../auth/testing/factories/token-payload.factory.js';
import { AccessManagementFacade } from './access-management.facade.js';

describe('Access management transactions', () => {
  const tx = {};
  let committed: boolean;
  const db = {
    $transaction: vi.fn(
      async (operation: (client: object) => Promise<unknown>) => {
        const result = await operation(tx);
        committed = true;
        return result;
      },
    ),
  };
  const access = { lockBrand: vi.fn(), affectedUserIds: vi.fn() };
  const administration = {
    changePolicy: vi.fn(),
    resetPolicy: vi.fn(),
    membership: vi.fn(),
    changeMembership: vi.fn(),
    createInvitation: vi.fn(),
  };
  const auth = { resolveTokenPayload: vi.fn() };
  const epochs = { bumpMany: vi.fn() };
  const staff = { bindAccessProfile: vi.fn(), releaseAccessProfile: vi.fn() };
  const brands = { acquireActiveOperationLock: vi.fn() };
  const users = { findById: vi.fn() };
  const service = new AccessManagementFacade(
    db as never,
    access as never,
    administration as never,
    auth as never,
    epochs as never,
    staff as never,
    {} as never,
    brands as never,
    users as never,
    {} as never,
    {} as never,
  );
  const signed = tokenPayload();
  const fresh = { ...signed, tokenEpoch: 7 };
  const dto = {
    expectedVersion: 3,
    changes: [
      {
        role: BusinessRole.MANAGER,
        permission: Permission.ORDER_RETURN,
        value: PermissionValue.DENY,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    committed = false;
    brands.acquireActiveOperationLock.mockResolvedValue(true);
    auth.resolveTokenPayload.mockImplementation(async () => {
      expect(access.lockBrand).toHaveBeenCalledWith('brand-1', tx);
      return fresh;
    });
    access.affectedUserIds.mockResolvedValue([
      'brand-member',
      'location-member',
    ]);
    administration.membership.mockResolvedValue({
      id: 'membership',
      userId: 'employee',
      role: BusinessRole.STAFF,
    });
    administration.changeMembership.mockResolvedValue({ id: 'membership' });
    users.findById.mockResolvedValue({ id: 'employee', role: UserRole.USER });
    epochs.bumpMany.mockResolvedValue(undefined);
  });

  it('rechecks current authority under the lock and invalidates all affected tokens in the transaction', async () => {
    await service.updatePolicy(signed, 'brand-1', 'location-1', dto);

    expect(auth.resolveTokenPayload).toHaveBeenCalledExactlyOnceWith(
      signed.sub,
      tx,
    );
    expect(administration.changePolicy).toHaveBeenCalledExactlyOnceWith(
      fresh,
      'brand-1',
      'location-1',
      3,
      dto.changes,
      tx,
    );
    expect(access.affectedUserIds).toHaveBeenCalledExactlyOnceWith(
      'brand-1',
      tx,
    );
    expect(epochs.bumpMany).toHaveBeenCalledExactlyOnceWith(
      ['brand-member', 'location-member', signed.sub],
      tx,
    );
    expect(committed).toBe(true);
  });

  it('also invalidates tokens when resetting a role policy', async () => {
    await service.resetPolicy(
      signed,
      'brand-1',
      undefined,
      BusinessRole.STAFF,
      3,
    );

    expect(administration.resetPolicy).toHaveBeenCalledExactlyOnceWith(
      fresh,
      'brand-1',
      undefined,
      BusinessRole.STAFF,
      3,
      tx,
    );
    expect(epochs.bumpMany).toHaveBeenCalledOnce();
    expect(committed).toBe(true);
  });

  it('fails the transaction when token invalidation fails', async () => {
    const failure = new Error('Epoch update failed');
    epochs.bumpMany.mockRejectedValue(failure);

    await expect(
      service.updatePolicy(signed, 'brand-1', undefined, dto),
    ).rejects.toBe(failure);
    expect(committed).toBe(false);
  });

  it('does not change access for a deleted brand', async () => {
    brands.acquireActiveOperationLock.mockResolvedValue(false);

    await expect(
      service.updatePolicy(signed, 'brand-1', undefined, dto),
    ).rejects.toMatchObject({ status: 404 });
    expect(administration.changePolicy).not.toHaveBeenCalled();
    expect(epochs.bumpMany).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  });

  it('invalidates only the membership target and releases a revoked staff binding', async () => {
    await service.changeMember(
      signed,
      'brand-1',
      'location-1',
      'membership',
      null,
      3,
    );

    expect(staff.releaseAccessProfile).toHaveBeenCalledExactlyOnceWith(
      'location-1',
      'employee',
      tx,
    );
    expect(epochs.bumpMany).toHaveBeenCalledExactlyOnceWith(['employee'], tx);
    expect(access.affectedUserIds).not.toHaveBeenCalled();
  });

  it('preserves a staff profile when promoting its account to manager', async () => {
    await service.changeMember(
      signed,
      'brand-1',
      'location-1',
      'membership',
      {
        role: BusinessRole.MANAGER,
        expectedVersion: 3,
      },
      3,
    );

    expect(staff.releaseAccessProfile).not.toHaveBeenCalled();
    expect(epochs.bumpMany).toHaveBeenCalledExactlyOnceWith(['employee'], tx);
  });

  it('checks membership authority before attempting a staff binding', async () => {
    administration.changeMembership.mockRejectedValueOnce(
      new ForbiddenException(),
    );

    await expect(
      service.changeMember(
        signed,
        'brand-1',
        'location-1',
        'membership',
        {
          role: BusinessRole.STAFF,
          staffId: 'profile',
          expectedVersion: 3,
        },
        3,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(staff.bindAccessProfile).not.toHaveBeenCalled();
    expect(epochs.bumpMany).not.toHaveBeenCalled();
    expect(committed).toBe(false);
  });

  it('does not invalidate existing tokens when creating an invitation', async () => {
    administration.createInvitation.mockResolvedValue({
      invitation: { id: 'invitation' },
      token: 'secret',
    });

    await service.createInvitation(signed, 'brand-1', { grants: [] });

    expect(epochs.bumpMany).not.toHaveBeenCalled();
    expect(access.affectedUserIds).not.toHaveBeenCalled();
    expect(committed).toBe(true);
  });
});
