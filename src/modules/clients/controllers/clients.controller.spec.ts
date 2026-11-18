import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import 'reflect-metadata';
import { Claim } from '../../access/enums/claim.enum.js';
import {
  Read,
  Write,
  addGrant,
  removeGrant,
} from '../../access/utils/permission.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { ClientReadGuard } from '../guards/client-read.guard.js';
import { ClientsController } from './clients.controller.js';

describe('Client reading for booking creators', () => {
  const permissionGuard = new PermissionGuard(new Reflector());
  const readGuard = new ClientReadGuard();
  const context = (
    operation: keyof ClientsController,
    token: TokenPayloadDto | undefined,
    brandId = 'brand-1',
  ) =>
    ({
      getHandler: () => ClientsController.prototype[operation],
      getClass: () => ClientsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: token, params: { brandId } }),
      }),
    }) as unknown as ExecutionContext;

  it.each(['search', 'findById'] as const)(
    'keeps authentication and token freshness on %s',
    (operation) => {
      expect(
        Reflect.getMetadata(
          GUARDS_METADATA,
          ClientsController.prototype[operation],
        ),
      ).toEqual([JwtAuthGuard, TokenEpochGuard, ClientReadGuard]);
    },
  );

  it.each(['search', 'findById'] as const)(
    'opens %s to a master who can create own bookings',
    (operation) => {
      expect(
        readGuard.canActivate(context(operation, tokenPayload('STAFF'))),
      ).toBe(true);
    },
  );

  it.each(['search', 'findById'] as const)(
    'closes %s to a master whose own booking writing was disabled',
    (operation) => {
      const token = tokenPayload('STAFF');
      removeGrant(token.permissions!['L:location-1'], Write(Claim.BOOKING_OWN));
      expect(() => readGuard.canActivate(context(operation, token))).toThrow(
        ForbiddenException,
      );
      addGrant(token.permissions!['G:brand-1'], Read(Claim.CLIENT));
      expect(readGuard.canActivate(context(operation, token))).toBe(true);
    },
  );

  it('does not open clients of another brand through a booking right', () => {
    expect(() =>
      readGuard.canActivate(
        context('search', tokenPayload('STAFF'), 'brand-2'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires an authenticated user', () => {
    expect(() => readGuard.canActivate(context('search', undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it.each(['MANAGER', 'OWNER'] as const)(
    'preserves client reading for %s without booking rights',
    (role) => {
      const token = tokenPayload(role);
      removeGrant(token.permissions!['L:location-1'], Write(Claim.BOOKING));
      removeGrant(token.permissions!['L:location-1'], Write(Claim.BOOKING_OWN));
      expect(readGuard.canActivate(context('findById', token))).toBe(true);
    },
  );

  it.each(['create', 'update', 'setBan', 'import', 'export'] as const)(
    'does not grant %s to a master through booking or client reading',
    (operation) => {
      const token = tokenPayload('STAFF');
      addGrant(token.permissions!['G:brand-1'], Read(Claim.CLIENT));
      expect(() =>
        permissionGuard.canActivate(context(operation, token)),
      ).toThrow(ForbiddenException);
    },
  );
});
