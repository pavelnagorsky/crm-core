import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Claim } from '../../access/enums/claim.enum.js';
import { Read, addGrant } from '../../access/utils/permission.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { ClientsController } from './clients.controller.js';

describe('Configurable staff client reading', () => {
  const guard = new PermissionGuard(new Reflector());
  const context = (
    operation: keyof ClientsController,
    token: TokenPayloadDto,
  ) =>
    ({
      getHandler: () => ClientsController.prototype[operation],
      getClass: () => ClientsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: token, params: { brandId: 'brand-1' } }),
      }),
    }) as unknown as ExecutionContext;

  it.each(['search', 'findById'] as const)(
    'closes %s by default and allows explicit reading',
    (operation) => {
      const token = tokenPayload('STAFF');
      expect(() => guard.canActivate(context(operation, token))).toThrow(
        ForbiddenException,
      );
      addGrant(token.permissions!['G:brand-1'], Read(Claim.CLIENT));
      expect(guard.canActivate(context(operation, token))).toBe(true);
    },
  );

  it.each(['create', 'update', 'setBan', 'import', 'export'] as const)(
    'does not grant %s through client reading',
    (operation) => {
      const token = tokenPayload('STAFF');
      addGrant(token.permissions!['G:brand-1'], Read(Claim.CLIENT));
      expect(() => guard.canActivate(context(operation, token))).toThrow(
        ForbiddenException,
      );
    },
  );

  it.each(['MANAGER', 'OWNER'] as const)(
    'preserves client reading for %s',
    (role) => {
      expect(guard.canActivate(context('search', tokenPayload(role)))).toBe(
        true,
      );
      expect(guard.canActivate(context('findById', tokenPayload(role)))).toBe(
        true,
      );
    },
  );
});
