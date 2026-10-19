import { ForbiddenException } from '@nestjs/common';
import { BusinessRole, UserRole } from '@prisma/client';
import { Claim } from '../access/enums/claim.enum.js';
import { Write } from '../access/utils/permission.js';
import { PermissionEffect } from '../access/enums/permission-effect.enum.js';
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
    invitationLink: vi.fn(),
    invitationByToken: vi.fn(),
    assertPending: vi.fn(),
    assertRole: vi.fn(),
    grantMembership: vi.fn(),
    markAccepted: vi.fn(),
    replaceOwner: vi.fn(),
  };
  const auth = { resolveTokenPayload: vi.fn() };
  const epochs = { bumpMany: vi.fn() };
  const staff = { bindAccessProfile: vi.fn(), releaseAccessProfile: vi.fn() };
  const brands = { acquireActiveOperationLock: vi.fn(), findById: vi.fn() };
  const notifications = { sendEmail: vi.fn() };
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
    {
      get: vi.fn().mockReturnValue({ domain: 'https://crm.example' }),
    } as never,
    notifications as never,
  );
  const signed = tokenPayload();
  const fresh = { ...signed, tokenEpoch: 7 };
  const dto = {
    expectedVersion: 3,
    changes: [
      {
        role: BusinessRole.MANAGER,
        ...Write(Claim.ORDER_RETURN),
        effect: PermissionEffect.DENY,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    committed = false;
    access.lockBrand.mockResolvedValue(undefined);
    brands.acquireActiveOperationLock.mockResolvedValue(true);
    auth.resolveTokenPayload.mockImplementation(async (userId) => {
      expect(access.lockBrand).toHaveBeenCalledWith('brand-1', tx);
      return { ...fresh, sub: userId };
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
    brands.findById.mockResolvedValue({ name: 'Brand' });
    notifications.sendEmail.mockResolvedValue(undefined);
  });

  it('requires a freshly resolved global grant to replace an owner', async () => {
    auth.resolveTokenPayload.mockResolvedValueOnce({
      ...fresh,
      permissions: { '*': ['*'] },
    });
    await service.replaceOwner(
      signed,
      'brand-1',
      'previous-owner',
      'new-owner',
      'Recovery',
    );
    expect(auth.resolveTokenPayload).toHaveBeenCalledExactlyOnceWith(
      signed.sub,
      tx,
    );
    expect(administration.replaceOwner).toHaveBeenCalledExactlyOnceWith(
      'brand-1',
      signed.sub,
      'previous-owner',
      'new-owner',
      'Recovery',
      tx,
    );
    expect(epochs.bumpMany).toHaveBeenCalledExactlyOnceWith(
      ['previous-owner', 'new-owner'],
      tx,
    );
  });

  it.each([UserRole.USER, UserRole.ADMIN])(
    'rejects owner replacement without a current global grant even for %s',
    async (role) => {
      auth.resolveTokenPayload.mockResolvedValueOnce({ ...fresh, role });
      await expect(
        service.replaceOwner(
          { ...signed, role: UserRole.ADMIN, permissions: { '*': ['*'] } },
          'brand-1',
          'previous-owner',
          'new-owner',
          'Recovery',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(administration.replaceOwner).not.toHaveBeenCalled();
      expect(epochs.bumpMany).not.toHaveBeenCalled();
    },
  );

  it('preserves protection of other platform administrators with a global grant', async () => {
    auth.resolveTokenPayload.mockResolvedValueOnce({
      ...fresh,
      permissions: { '*': ['*'] },
    });
    users.findById.mockResolvedValueOnce({
      id: 'previous-owner',
      role: UserRole.ADMIN,
    });
    await expect(
      service.replaceOwner(
        signed,
        'brand-1',
        'previous-owner',
        'new-owner',
        'Recovery',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(administration.replaceOwner).not.toHaveBeenCalled();
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

  it('sends the same link only after closing the database transaction', async () => {
    administration.invitationLink.mockResolvedValue({
      invitation: { id: 'invitation' },
      token: 'same-token',
    });
    notifications.sendEmail.mockImplementation(async (notification) => {
      expect(committed).toBe(true);
      expect(notification.toEmail()).toMatchObject({
        to: 'member@example.com',
        data: {
          invitationLink: 'https://crm.example/invitation#token=same-token',
        },
      });
    });
    await service.sendInvitationEmail(
      signed,
      'brand-1',
      'invitation',
      'member@example.com',
    );
    expect(administration.invitationLink).toHaveBeenCalledExactlyOnceWith(
      fresh,
      'brand-1',
      'invitation',
      tx,
    );
    expect(administration.createInvitation).not.toHaveBeenCalled();
    expect(epochs.bumpMany).not.toHaveBeenCalled();
  });

  it('preserves a copyable link after email delivery fails', async () => {
    const result = { invitation: { id: 'invitation' }, token: 'same-token' };
    administration.invitationLink.mockResolvedValue(result);
    notifications.sendEmail.mockRejectedValue(new Error('SMTP failed'));
    await expect(
      service.sendInvitationEmail(
        signed,
        'brand-1',
        'invitation',
        'member@example.com',
      ),
    ).rejects.toThrow('SMTP failed');
    expect(
      await service.invitationLink(signed, 'brand-1', 'invitation'),
    ).toEqual(result);
    expect(administration.createInvitation).not.toHaveBeenCalled();
  });

  it('does not send an email when invitation access is denied', async () => {
    administration.invitationLink.mockRejectedValueOnce(
      new ForbiddenException(),
    );
    await expect(
      service.sendInvitationEmail(
        signed,
        'brand-1',
        'invitation',
        'member@example.com',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(notifications.sendEmail).not.toHaveBeenCalled();
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

  it('returns 404 for a missing brand before creating access state', async () => {
    brands.acquireActiveOperationLock.mockResolvedValue(false);
    access.lockBrand.mockRejectedValue(new Error('Foreign key violation'));

    await expect(
      service.invitationLink(signed, 'missing-brand', 'invitation'),
    ).rejects.toMatchObject({ status: 404 });
    expect(access.lockBrand).not.toHaveBeenCalled();
    expect(auth.resolveTokenPayload).not.toHaveBeenCalled();
    expect(administration.invitationLink).not.toHaveBeenCalled();
  });

  it('invalidates the recipient JWT only when an invitation is accepted for the first time', async () => {
    const invitation = {
      id: 'invitation',
      brandId: 'brand-1',
      issuerId: 'issuer',
      acceptedById: null,
      grants: [{ role: BusinessRole.MANAGER, locationId: null, staffId: null }],
    };
    const accepted = { ...invitation, acceptedById: signed.sub };
    administration.invitationByToken.mockResolvedValue(invitation);
    administration.markAccepted.mockResolvedValue(accepted);

    expect(await service.accept(signed, 'invitation-token')).toEqual(accepted);
    expect(administration.grantMembership).toHaveBeenCalledExactlyOnceWith(
      'brand-1',
      signed.sub,
      BusinessRole.MANAGER,
      null,
      tx,
    );
    expect(epochs.bumpMany).toHaveBeenCalledExactlyOnceWith([signed.sub], tx);
    expect(committed).toBe(true);
  });

  it('does not revoke JWT or regrant access when retrying an already accepted invitation', async () => {
    const accepted = {
      id: 'invitation',
      brandId: 'brand-1',
      issuerId: 'issuer',
      acceptedById: signed.sub,
      acceptedAt: new Date('2020-01-01T00:00:00Z'),
      expiresAt: new Date('2020-01-08T00:00:00Z'),
      grants: [{ role: BusinessRole.MANAGER, locationId: null, staffId: null }],
    };
    administration.invitationByToken.mockResolvedValue(accepted);

    expect(await service.accept(signed, 'invitation-token')).toEqual(accepted);
    expect(administration.grantMembership).not.toHaveBeenCalled();
    expect(administration.markAccepted).not.toHaveBeenCalled();
    expect(administration.assertPending).not.toHaveBeenCalled();
    expect(epochs.bumpMany).not.toHaveBeenCalled();
    expect(users.findById).not.toHaveBeenCalled();
    expect(committed).toBe(true);
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
    expect(notifications.sendEmail).not.toHaveBeenCalled();
    expect(committed).toBe(true);
  });
});
