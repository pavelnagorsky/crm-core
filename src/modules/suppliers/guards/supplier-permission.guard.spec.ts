import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { BusinessRole, UserRole } from '@prisma/client';
import 'reflect-metadata';
import { authorizeTestToken } from '../../../../test/factories/token-payload.factory.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { SuppliersController } from '../controllers/suppliers.controller.js';

function payload(overrides: Partial<TokenPayloadDto> = {}): TokenPayloadDto {
  return authorizeTestToken({
    sub: 'user-1',
    role: UserRole.USER,
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 100,
    ...overrides,
  });
}

function context(
  operation: keyof SuppliersController,
  user: TokenPayloadDto | undefined,
  params: Record<string, string> = { brandId: 'brand-1' },
): ExecutionContext {
  return {
    getHandler: () => SuppliersController.prototype[operation],
    getClass: () => SuppliersController,
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
}

const operations = [
  'create',
  'search',
  'listOptions',
  'findById',
  'update',
  'deactivate',
] as const;
const mutations = ['create', 'update', 'deactivate'] as const;
const reads = ['search', 'listOptions', 'findById'] as const;

describe.each(operations)('PermissionGuard: %s', (operation) => {
  const guard = new PermissionGuard(new Reflector());

  it('keeps authentication and token freshness checks on the endpoint', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        SuppliersController.prototype[operation],
      ),
    ).toEqual([JwtAuthGuard, TokenEpochGuard, PermissionGuard]);
  });

  it('allows a location manager in the supplier brand without brand membership', () => {
    const user = payload({
      locationMemberships: [
        {
          locationId: 'location-1',
          brandId: 'brand-1',
          role: BusinessRole.MANAGER,
        },
      ],
    });

    expect(guard.canActivate(context(operation, user))).toBe(true);
  });

  it.each([BusinessRole.OWNER, BusinessRole.MANAGER])(
    'allows a brand member with role %s',
    (role) => {
      const user = payload({
        brandMemberships: [{ brandId: 'brand-1', role }],
      });

      expect(guard.canActivate(context(operation, user))).toBe(true);
    },
  );

  it('allows a system administrator', () => {
    expect(
      guard.canActivate(context(operation, payload({ role: UserRole.ADMIN }))),
    ).toBe(true);
  });

  it('denies a manager of another brand even with staff access to the supplier brand', () => {
    const user = payload({
      locationMemberships: [
        {
          locationId: 'location-2',
          brandId: 'brand-2',
          role: BusinessRole.MANAGER,
        },
        {
          locationId: 'location-1',
          brandId: 'brand-1',
          role: BusinessRole.STAFF,
        },
      ],
    });

    expect(() => guard.canActivate(context(operation, user))).toThrow(
      ForbiddenException,
    );
  });

  it('denies a user with no memberships', () => {
    expect(() => guard.canActivate(context(operation, payload()))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request', () => {
    expect(() => guard.canActivate(context(operation, undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request without a brand identifier', () => {
    expect(() => guard.canActivate(context(operation, payload(), {}))).toThrow(
      ForbiddenException,
    );
  });
});

describe('PermissionGuard: staff access', () => {
  const guard = new PermissionGuard(new Reflector());
  const user = payload({
    brandMemberships: [{ brandId: 'brand-1', role: BusinessRole.STAFF }],
  });

  it.each(mutations)('denies brand staff access to %s', (operation) => {
    expect(() => guard.canActivate(context(operation, user))).toThrow(
      ForbiddenException,
    );
  });

  it.each(reads)('rejects obsolete brand STAFF access to %s', (operation) => {
    expect(() => guard.canActivate(context(operation, user))).toThrow(
      ForbiddenException,
    );
  });
});
