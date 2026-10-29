import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { DatabaseService } from '../../../database/database.service.js';
import { PermissionCalculator } from '../../access/calculators/permission.calculator.js';
import { AccessService } from '../../access/services/access.service.js';
import { UserService } from '../../user/services/user.service.js';
import { AuthService } from './auth.service.js';
import { TokenEpochRegistryService } from './token-epoch-registry.service.js';

const user = {
  id: 'user-1',
  role: UserRole.USER,
  firstName: 'Anna',
  lastName: 'Ivanova',
  phone: null,
  email: 'anna@example.com',
  passwordHash: null,
  phoneVerifiedAt: null,
  emailVerifiedAt: new Date(),
  isMarketingEmailsEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as User;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('AuthService refresh token storage', () => {
  const db = {
    brandMembership: { findMany: vi.fn().mockResolvedValue([]) },
    locationMembership: { findMany: vi.fn().mockResolvedValue([]) },
    location: { findMany: vi.fn().mockResolvedValue([]) },
    brandPermissionOverride: { findMany: vi.fn().mockResolvedValue([]) },
    locationPermissionOverride: { findMany: vi.fn().mockResolvedValue([]) },
    refreshToken: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const users = {
    findByEmail: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
  };
  const jwt = {
    signAsync: vi.fn(
      async (payload: Record<string, unknown>, options: { secret: string }) =>
        options.secret === 'refresh-secret'
          ? `refresh-${String(payload.jti)}`
          : 'access-token',
    ),
  };
  const config = {
    get: vi.fn((key: string) =>
      key === 'jwt'
        ? {
            accessTokenSecret: 'access-secret',
            refreshTokenSecret: 'refresh-secret',
          }
        : undefined,
    ),
  };
  const tokenEpoch = { get: vi.fn().mockResolvedValue(0) };
  const service = new AuthService(
    db as unknown as DatabaseService,
    users as unknown as UserService,
    jwt as unknown as JwtService,
    { emit: vi.fn() } as unknown as EventEmitter2,
    config as unknown as ConfigService,
    tokenEpoch as unknown as TokenEpochRegistryService,
    new AccessService(
      db as unknown as DatabaseService,
      new PermissionCalculator(),
    ),
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    db.refreshToken.findMany.mockResolvedValue([]);
    db.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    db.brandMembership.findMany.mockResolvedValue([]);
    db.locationMembership.findMany.mockResolvedValue([]);
    db.location.findMany.mockResolvedValue([]);
  });

  it('stores only a SHA-256 hash and gives every refresh JWT a jti', async () => {
    const tokens = await service.handleOAuth(
      {
        email: user.email!,
        providerType: 'GOOGLE',
      } as never,
      'browser',
    );

    const refreshSignCall = jwt.signAsync.mock.calls.find(
      ([, options]) => options.secret === 'refresh-secret',
    );
    expect(refreshSignCall?.[0]).toEqual({
      sub: user.id,
      jti: expect.any(String),
    });
    expect(db.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: sha256(tokens.refreshToken),
        userAgent: 'browser',
      }),
    });
    expect(db.refreshToken.create.mock.calls[0][0].data).not.toHaveProperty(
      'token',
    );
  });

  it('embeds scoped permissions and memberships when issuing JWT', async () => {
    await service.handleOAuth(
      { email: user.email!, providerType: 'GOOGLE' } as never,
      'browser',
    );
    const call = jwt.signAsync.mock.calls.find(
      ([, options]) => options.secret === 'access-secret',
    );
    expect(call?.[0]).toMatchObject({ sub: user.id, role: user.role });
    expect(call?.[0]).toHaveProperty('brandMemberships', []);
    expect(call?.[0]).toHaveProperty('locationMemberships', []);
    expect(call?.[0]).not.toHaveProperty('access');
    expect(call?.[0]).toHaveProperty('permissions', {});
    expect(call?.[0]).toHaveProperty('tokenEpoch', 0);
  });

  it('hashes the cookie value when logging out', async () => {
    await service.logout(user.id, 'raw-refresh-token');

    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        tokenHash: sha256('raw-refresh-token'),
      },
    });
  });

  it.each(['oauth', 'refresh'])(
    'issues the global claim from the current platform role on %s',
    async (method) => {
      users.findById.mockResolvedValueOnce({ ...user, role: UserRole.ADMIN });
      if (method === 'refresh') {
        db.refreshToken.deleteMany.mockResolvedValueOnce({ count: 1 });
        // Refresh reads the user before resolving the latest access-token payload.
        users.findById.mockResolvedValueOnce({ ...user, role: UserRole.ADMIN });
        await service.refresh(user.id, 'old-refresh-token', 'browser');
      } else {
        await service.handleOAuth(
          { email: user.email!, providerType: 'GOOGLE' } as never,
          'browser',
        );
      }
      const call = jwt.signAsync.mock.calls.find(
        ([, options]) => options.secret === 'access-secret',
      );
      expect(call?.[0]).toMatchObject({
        role: UserRole.ADMIN,
        permissions: { '*': ['*'] },
        brandMemberships: [],
        locationMemberships: [],
      });
    },
  );

  it('atomically consumes a valid token before rotating it', async () => {
    db.refreshToken.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });

    await service.refresh(user.id, 'old-refresh-token', 'browser');

    expect(db.refreshToken.deleteMany.mock.calls[0][0]).toEqual({
      where: {
        userId: user.id,
        tokenHash: sha256('old-refresh-token'),
        expiryDate: { gt: expect.any(Date) },
      },
    });
    expect(users.findById).toHaveBeenCalledWith(user.id);
    expect(db.refreshToken.create).toHaveBeenCalledOnce();
  });

  it('rejects an unknown, expired, or already consumed token', async () => {
    await expect(
      service.refresh(user.id, 'invalid-refresh-token', null),
    ).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });

    expect(users.findById).not.toHaveBeenCalled();
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('AuthService email confirmation', () => {
  function setup() {
    const confirmedUser = { ...user, tokenEpoch: 0 };
    const tx = {
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(confirmedUser),
      },
      refreshToken: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
    };
    const db = {
      $transaction: vi.fn(async (run: (value: typeof tx) => unknown) =>
        run(tx),
      ),
    };
    const users = new UserService(db as never);
    const access = {
      resolvePermissions: vi.fn().mockResolvedValue({
        brandMemberships: [],
        locationMemberships: [],
        permissions: {},
      }),
    };
    const jwt = new JwtService();
    const config = {
      get: vi.fn().mockReturnValue({
        accessTokenSecret: 'access-secret',
        refreshTokenSecret: 'refresh-secret',
      }),
    };
    const service = new AuthService(
      db as never,
      users,
      jwt,
      {} as never,
      config as never,
      new TokenEpochRegistryService(users),
      access as never,
      {} as never,
    );
    return { service, db, tx, jwt, access };
  }

  it('confirms the user and saves a session in the same transaction', async () => {
    const { service, db, tx, jwt, access } = setup();

    const tokens = await service.confirmEmail(user.id, 'browser');

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(access.resolvePermissions).toHaveBeenCalledWith(
      user.id,
      user.role,
      tx,
    );
    expect(
      jwt.verify(tokens.accessToken, { secret: 'access-secret' }),
    ).toMatchObject({
      sub: user.id,
      role: user.role,
      tokenEpoch: 0,
      permissions: {},
    });
    expect(
      jwt.verify(tokens.refreshToken, { secret: 'refresh-secret' }),
    ).toMatchObject({
      sub: user.id,
      jti: expect.any(String),
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        tokenHash: sha256(tokens.refreshToken),
        userAgent: 'browser',
      }),
    });
  });

  it('rejects an already confirmed or missing user without issuing a session', async () => {
    const { service, tx, access } = setup();
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.confirmEmail(user.id, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(access.resolvePermissions).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('issues only one session when concurrent confirmations compete for the same user', async () => {
    const { service, tx } = setup();
    tx.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });

    const results = await Promise.allSettled([
      service.confirmEmail(user.id, 'browser-1'),
      service.confirmEmail(user.id, 'browser-2'),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(results[1]).toMatchObject({
      reason: expect.any(UnauthorizedException),
    });
    expect(tx.refreshToken.create).toHaveBeenCalledOnce();
    await expect(service.confirmEmail(user.id, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.refreshToken.create).toHaveBeenCalledOnce();
  });

  it('rejects the transaction when session storage fails', async () => {
    const { service, db, tx } = setup();
    const failure = new Error('Session storage unavailable');
    tx.refreshToken.create.mockRejectedValue(failure);

    await expect(service.confirmEmail(user.id, null)).rejects.toBe(failure);
    await expect(db.$transaction.mock.results[0].value).rejects.toBe(failure);
    expect(tx.refreshToken.findMany).not.toHaveBeenCalled();
  });
});
