import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessRole } from '@prisma/client';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { PermissionCalculator } from '../calculators/permission.calculator.js';
import { AccessScope } from '../enums/access-scope.enum.js';
import { AccessAdministrationService } from './access-administration.service.js';
import { AccessInvitationTokenService } from './access-invitation-token.service.js';

describe('Invitation creation and stable links', () => {
  const tokens = new AccessInvitationTokenService(
    new ConfigService({ jwt: { emailTokenSecret: 'test-secret' } }),
  );
  const db = {
    accessInvitation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const access = { recordChange: vi.fn() };
  const service = new AccessAdministrationService(
    db as never,
    access as never,
    new PermissionCalculator(),
    tokens,
  );
  const actor = tokenPayload(BusinessRole.MANAGER);
  const grants = [
    {
      scope: AccessScope.LOCATION,
      role: BusinessRole.STAFF,
      locationId: 'location-1',
      staffId: 'staff-1',
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    db.accessInvitation.create.mockImplementation(async ({ data }) => ({
      id: 'invitation-1',
      ...data,
      acceptedAt: null,
      revokedAt: null,
      grants,
    }));
  });

  const create = () =>
    service.createInvitation(actor, 'brand-1', grants, db as never);
  const getLink = () =>
    service.invitationLink(actor, 'brand-1', 'invitation-1', db as never);

  it('persists an encrypted token and retrieves exactly the link created originally', async () => {
    const created = await create();
    db.accessInvitation.findFirst.mockResolvedValue(created.invitation);
    expect(await getLink()).toEqual(created);
    expect(await getLink()).toEqual(created);
    expect(db.accessInvitation.update).not.toHaveBeenCalled();
    expect(access.recordChange).toHaveBeenCalledOnce();
    const saved = db.accessInvitation.create.mock.calls[0][0].data;
    expect(saved.tokenHash).toBe(tokens.hash(created.token));
    expect(saved).not.toHaveProperty('token');
    expect(JSON.stringify(access.recordChange.mock.calls)).not.toContain(
      created.token,
    );
    expect(JSON.stringify(saved)).not.toContain(created.token);
  });

  it.each(['accepted', 'revoked', 'expired'] as const)(
    'refuses to retrieve an %s invitation link',
    async (state) => {
      const { invitation } = await create();
      db.accessInvitation.findFirst.mockResolvedValue({
        ...invitation,
        acceptedAt: state === 'accepted' ? new Date() : null,
        revokedAt: state === 'revoked' ? new Date() : null,
        expiresAt: new Date(Date.now() + (state === 'expired' ? -1 : 60_000)),
      });
      await expect(getLink()).rejects.toMatchObject({ status: 410 });
      expect(db.accessInvitation.update).not.toHaveBeenCalled();
    },
  );

  it('requires authority over every grant before revealing the link', async () => {
    const { invitation } = await create();
    db.accessInvitation.findFirst.mockResolvedValue({
      ...invitation,
      grants: [...grants, { ...grants[0], locationId: 'location-2' }],
    });
    await expect(getLink()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('looks up invitations inside the requested brand', async () => {
    db.accessInvitation.findFirst.mockResolvedValue(null);
    await expect(getLink()).rejects.toMatchObject({ status: 404 });
    expect(db.accessInvitation.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'invitation-1', brandId: 'brand-1' },
      include: { grants: true },
    });
  });

  it('continues to resolve the original token by its hash', async () => {
    const created = await create();
    db.accessInvitation.findUnique.mockResolvedValue(created.invitation);
    expect(await service.invitationByToken(created.token, db as never)).toEqual(
      created.invitation,
    );
    expect(db.accessInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: tokens.hash(created.token) },
      include: { grants: true },
    });
  });

  it('keeps the original revocation date and access revision on repeated revocation', async () => {
    const { invitation } = await create();
    access.recordChange.mockClear();
    db.accessInvitation.findFirst.mockResolvedValue({
      ...invitation,
      revokedAt: new Date('2020-01-01T00:00:00Z'),
    });

    await service.revokeInvitation(
      actor,
      'brand-1',
      'invitation-1',
      db as never,
    );

    expect(db.accessInvitation.update).not.toHaveBeenCalled();
    expect(access.recordChange).not.toHaveBeenCalled();
  });

  it('records revocation once for an active invitation', async () => {
    const { invitation } = await create();
    access.recordChange.mockClear();
    db.accessInvitation.findFirst.mockResolvedValue(invitation);

    await service.revokeInvitation(
      actor,
      'brand-1',
      'invitation-1',
      db as never,
    );

    expect(db.accessInvitation.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'invitation-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(access.recordChange).toHaveBeenCalledOnce();
  });

  it('rejects revocation of an accepted invitation', async () => {
    const { invitation } = await create();
    access.recordChange.mockClear();
    db.accessInvitation.findFirst.mockResolvedValue({
      ...invitation,
      acceptedAt: new Date(),
    });

    await expect(
      service.revokeInvitation(actor, 'brand-1', 'invitation-1', db as never),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.accessInvitation.update).not.toHaveBeenCalled();
    expect(access.recordChange).not.toHaveBeenCalled();
  });
});
