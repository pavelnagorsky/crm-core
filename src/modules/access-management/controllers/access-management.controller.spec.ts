import { ForbiddenException } from '@nestjs/common';
import { BusinessRole } from '@prisma/client';
import { AccessSearchRequestDto } from '../../access/dto/access-search-request.dto.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { UserService } from '../../user/services/user.service.js';
import { AccessManagementController } from './access-management.controller.js';

describe('Access membership participant details', () => {
  const management = { scope: vi.fn(), members: vi.fn() };
  const administration = { version: vi.fn() };
  const db = { user: { findMany: vi.fn() } };
  const controller = new AccessManagementController(
    management as never,
    administration as never,
    {} as never,
    {} as never,
    new UserService(db as never),
  );
  const owner = {
    id: 'brand-membership',
    userId: 'owner',
    brandId: 'brand-1',
    locationId: null,
    role: BusinessRole.OWNER,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
  const local = {
    ...owner,
    id: 'local-membership',
    locationId: 'location-1',
    role: BusinessRole.MANAGER,
  };
  const participant = {
    id: 'owner',
    firstName: 'Анна',
    lastName: 'Иванова',
    email: 'anna@example.com',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    management.scope.mockResolvedValue({
      brandId: 'brand-1',
      locationId: undefined,
    });
    management.members.mockResolvedValue([owner, local]);
    administration.version.mockResolvedValue(3);
    db.user.findMany.mockResolvedValue([participant]);
  });

  it('returns account names for brand and location assignments without a staff lookup', async () => {
    const response = await controller.members(
      tokenPayload(),
      new AccessSearchRequestDto(),
      'brand-1',
    );

    expect(response.responseValue).toMatchObject({
      version: 3,
      totalItems: 2,
      items: [owner, local].map((row) => ({
        ...row,
        firstName: 'Анна',
        lastName: 'Иванова',
        email: 'anna@example.com',
      })),
    });
    expect(db.user.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['owner'] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  });

  it('does not attach a newer access version to memberships fetched before a concurrent change', async () => {
    let revision = 3;
    administration.version.mockImplementation(async () => revision);
    management.members.mockImplementation(async () => {
      revision = 4;
      return [owner, local];
    });

    const response = await controller.members(
      tokenPayload(),
      new AccessSearchRequestDto(),
      'brand-1',
    );

    expect(response.responseValue?.version).toBe(3);
    expect(revision).toBe(4);
  });

  it('only loads accounts appearing on the returned page', async () => {
    management.members.mockResolvedValue([
      owner,
      { ...local, userId: 'manager' },
    ]);
    db.user.findMany.mockResolvedValue([
      {
        id: 'manager',
        firstName: null,
        lastName: null,
        email: 'manager@example.com',
        passwordHash: 'private',
        tokenEpoch: 42,
      },
    ]);
    const request = Object.assign(new AccessSearchRequestDto(), {
      page: 2,
      pageSize: 1,
    });

    const response = await controller.members(
      tokenPayload(),
      request,
      'brand-1',
    );

    expect(db.user.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['manager'] } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    expect(response.responseValue?.totalItems).toBe(2);
    expect(response.responseValue?.items).toEqual([
      {
        ...local,
        userId: 'manager',
        firstName: null,
        lastName: null,
        email: 'manager@example.com',
      },
    ]);
  });

  it('preserves null account details without inventing a staff name', async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: 'owner',
        firstName: null,
        lastName: null,
        email: null,
      },
    ]);
    const response = await controller.members(
      tokenPayload(),
      new AccessSearchRequestDto(),
      'brand-1',
    );

    expect(response.responseValue?.items).toEqual(
      [owner, local].map((row) => ({
        ...row,
        firstName: null,
        lastName: null,
        email: null,
      })),
    );
  });

  it('skips account queries for an empty page', async () => {
    const request = Object.assign(new AccessSearchRequestDto(), { page: 2 });

    const response = await controller.members(
      tokenPayload(),
      request,
      'brand-1',
    );

    expect(response.responseValue?.items).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('does not load participant details when access is denied', async () => {
    management.members.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.members(
        tokenPayload(),
        new AccessSearchRequestDto(),
        'brand-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('includes account details for every accessible assignment when exporting', async () => {
    const request = Object.assign(new AccessSearchRequestDto(), {
      page: 2,
      pageSize: 1,
      isExport: true,
    });

    const response = await controller.members(
      tokenPayload(),
      request,
      'brand-1',
    );

    expect(response.responseValue?.items).toHaveLength(2);
    expect(
      response.responseValue?.items.every(
        (row) => row.email === participant.email,
      ),
    ).toBe(true);
  });
});
