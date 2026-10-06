import {
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole, UserRole } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { TokenEpochRegistryService } from '../token-epoch-registry.service.js';
import { BrandRbacGuard } from './brand-rbac.guard.js';
import { LocationRbacGuard } from './location-rbac.guard.js';
import { RBAC_ROLES_KEY } from './rbac-roles-key.js';
import { TokenEpochGuard } from './token-epoch.guard.js';

function context(
  user: TokenPayloadDto,
  params: Record<string, string>,
): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext;
}

function payload(overrides: Partial<TokenPayloadDto> = {}): TokenPayloadDto {
  return {
    sub: 'user-1',
    role: UserRole.USER,
    firstName: 'Ada',
    lastName: 'Lovelace',
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 100,
    ...overrides,
  };
}

function reflector(...roles: BusinessRole[]): Reflector {
  return {
    getAllAndOverride: vi.fn((key: string) =>
      key === RBAC_ROLES_KEY ? roles : undefined,
    ),
  } as unknown as Reflector;
}

describe('BrandRbacGuard', () => {
  it('allows a brand member with the required role', () => {
    const guard = new BrandRbacGuard(reflector(BusinessRole.OWNER));
    const user = payload({
      brandMemberships: [{ brandId: 'brand-1', role: BusinessRole.OWNER }],
    });

    expect(guard.canActivate(context(user, { brandId: 'brand-1' }))).toBe(true);
  });
});

describe('LocationRbacGuard', () => {
  it('allows a direct location member', () => {
    const guard = new LocationRbacGuard(reflector(BusinessRole.STAFF));
    const user = payload({
      locationMemberships: [
        {
          locationId: 'location-1',
          brandId: 'brand-1',
          role: BusinessRole.STAFF,
        },
      ],
    });

    expect(guard.canActivate(context(user, { locationId: 'location-1' }))).toBe(
      true,
    );
  });

  it('allows a brand member through a known location mapping', () => {
    const guard = new LocationRbacGuard(reflector(BusinessRole.OWNER));
    const user = payload({
      brandMemberships: [{ brandId: 'brand-1', role: BusinessRole.OWNER }],
      locationMemberships: [
        {
          locationId: 'location-1',
          brandId: 'brand-1',
          role: BusinessRole.STAFF,
        },
      ],
    });

    expect(guard.canActivate(context(user, { locationId: 'location-1' }))).toBe(
      true,
    );
  });

  it('denies insufficient role on a known location', () => {
    const guard = new LocationRbacGuard(reflector(BusinessRole.OWNER));
    const user = payload({
      locationMemberships: [
        {
          locationId: 'location-1',
          brandId: 'brand-1',
          role: BusinessRole.STAFF,
        },
      ],
    });

    expect(() =>
      guard.canActivate(context(user, { locationId: 'location-1' })),
    ).toThrow(ForbiddenException);
  });

  it('signals a stale token when the location mapping is missing', () => {
    const guard = new LocationRbacGuard(reflector(BusinessRole.STAFF));

    expect(() =>
      guard.canActivate(context(payload(), { locationId: 'location-new' })),
    ).toThrow(AppException);
    try {
      guard.canActivate(context(payload(), { locationId: 'location-new' }));
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
      expect((error as AppException).errorCode).toBe('TOKEN_PAYLOAD_STALE');
    }
  });
});

describe('TokenEpochGuard', () => {
  it('signals a stale token when the registry epoch is newer', async () => {
    const registry = {
      get: vi.fn().mockResolvedValue(200),
    } as unknown as TokenEpochRegistryService;
    const guard = new TokenEpochGuard(registry);

    await expect(
      guard.canActivate(context(payload({ tokenEpoch: 100 }), {})),
    ).rejects.toMatchObject({
      errorCode: 'TOKEN_PAYLOAD_STALE',
    });
  });
});
