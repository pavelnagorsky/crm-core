import { createHash } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { UserService } from '../user/user.service.js';
import { TokenEpochRegistryService } from './token-epoch-registry.service.js';
import { AuthService } from './auth.service.js';

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
  );

  beforeEach(() => {
    vi.clearAllMocks();
    db.refreshToken.findMany.mockResolvedValue([]);
    db.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
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

  it('hashes the cookie value when logging out', async () => {
    await service.logout(user.id, 'raw-refresh-token');

    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        tokenHash: sha256('raw-refresh-token'),
      },
    });
  });

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
