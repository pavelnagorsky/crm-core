import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessRole } from '@prisma/client';
import { PermissionGuard } from '../../auth/guards/permission.guard.js';
import { tokenPayload } from '../../auth/testing/factories/token-payload.factory.js';
import { DashboardController } from '../../dashboard/controllers/dashboard.controller.js';
import { OrdersController } from './orders.controller.js';

const guard = new PermissionGuard(new Reflector());

function context<T extends object>(
  controller: new (...args: never[]) => T,
  operation: keyof T,
  role: BusinessRole,
): ExecutionContext {
  return {
    getHandler: () => controller.prototype[operation],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user: tokenPayload(role),
        params: { locationId: 'location-1' },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('Payment endpoint permissions', () => {
  it.each(['recordPayment', 'refund', 'voidPaymentOperation'] as const)(
    'keeps order %s from a master and opens it to a manager',
    (operation) => {
      expect(() =>
        guard.canActivate(
          context(OrdersController, operation, BusinessRole.STAFF),
        ),
      ).toThrow(ForbiddenException);
      expect(
        guard.canActivate(
          context(OrdersController, operation, BusinessRole.MANAGER),
        ),
      ).toBe(true);
    },
  );

  it('opens the finance summary only with analytics.location:read', () => {
    expect(() =>
      guard.canActivate(
        context(DashboardController, 'getFinanceSummary', BusinessRole.STAFF),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        context(DashboardController, 'getFinanceSummary', BusinessRole.OWNER),
      ),
    ).toBe(true);
  });
});
