import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import {
  authorizeTestToken,
  tokenPayload,
} from '../testing/factories/token-payload.factory.js';
import { JwtAccessStrategy } from './jwt-access.strategy.js';

describe('Access JWT claim migration', () => {
  const strategy = new JwtAccessStrategy({
    get: () => ({ accessTokenSecret: 'test-secret' }),
  } as unknown as ConfigService);

  it('requires a refresh for a legacy administrator token without a global grant', () => {
    const token = { ...tokenPayload(), role: UserRole.ADMIN, permissions: {} };
    expect(() => strategy.validate(token)).toThrow(
      expect.objectContaining({
        status: 409,
        errorCode: 'TOKEN_PAYLOAD_STALE',
        payload: {
          action: 'REFRESH_ACCESS_TOKEN',
          reason: 'GLOBAL_PERMISSION_MISSING',
        },
      }),
    );
  });

  it('accepts a refreshed administrator token with no memberships', () => {
    const token = authorizeTestToken({
      ...tokenPayload(),
      role: UserRole.ADMIN,
      brandMemberships: [],
      locationMemberships: [],
    });
    expect(strategy.validate(token)).toBe(token);
  });

  it('continues to accept ordinary scoped tokens', () => {
    const token = tokenPayload();
    expect(strategy.validate(token)).toBe(token);
  });

  it.each([undefined, 1, 3])(
    'refreshes an unsupported permissions format %s even with empty or global grants',
    (version) => {
      for (const permissions of [{}, { '*': ['*'] }]) {
        const token = {
          ...tokenPayload(),
          permissions: permissions as never,
          permissionsVersion: version,
        };
        expect(() => strategy.validate(token)).toThrow(
          expect.objectContaining({
            status: 409,
            payload: {
              action: 'REFRESH_ACCESS_TOKEN',
              reason: 'PERMISSIONS_FORMAT_CHANGED',
            },
          }),
        );
      }
    },
  );

  it('continues to require refresh for tokens with no permissions field', () => {
    const token = tokenPayload();
    delete token.permissions;
    expect(() => strategy.validate(token)).toThrow(
      expect.objectContaining({
        status: 409,
        errorCode: 'TOKEN_PAYLOAD_STALE',
        payload: {
          action: 'REFRESH_ACCESS_TOKEN',
          reason: 'PERMISSIONS_MISSING',
        },
      }),
    );
  });
});
