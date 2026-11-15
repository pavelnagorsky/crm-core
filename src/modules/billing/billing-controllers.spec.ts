import { RequestMethod, Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
} from '@nestjs/common/constants.js';
import { Claim } from '../access/enums/claim.enum.js';
import { Read, Write } from '../access/utils/permission.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  PermissionGuard,
  PERMISSIONS_KEY,
} from '../auth/guards/permission.guard.js';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard.js';
import { TokenEpochGuard } from '../auth/guards/token-epoch.guard.js';
import { AdminBillingPlansController } from './admin/controllers/admin-billing-plans.controller.js';
import { AdminBillingSettingsController } from './admin/controllers/admin-billing-settings.controller.js';
import { AdminSubscriptionPaymentsController } from './admin/controllers/admin-subscription-payments.controller.js';
import { AdminSubscriptionsController } from './admin/controllers/admin-subscriptions.controller.js';
import { BrandSubscriptionController } from './owner/controllers/brand-subscription.controller.js';
import { PublicBillingPlansController } from './owner/controllers/public-billing-plans.controller.js';
import { UserSubscriptionStatesController } from './owner/controllers/user-subscription-states.controller.js';

type Handler = (...args: unknown[]) => unknown;

/** Route handlers of a controller: methods with an HTTP method. */
function routes(controller: Type): [string, Handler][] {
  const proto = controller.prototype as Record<string, Handler>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name): [string, Handler] => [name, proto[name]])
    .filter(
      ([, handler]) =>
        Reflect.getMetadata(METHOD_METADATA, handler) !== undefined,
    );
}

function cacheControl(handler: Handler): string | undefined {
  const headers = (Reflect.getMetadata(HEADERS_METADATA, handler) ?? []) as {
    name: string;
    value: string;
  }[];
  return headers.find((h) => h.name === 'Cache-Control')?.value;
}

const ADMIN_CONTROLLERS: Type[] = [
  AdminBillingPlansController,
  AdminBillingSettingsController,
  AdminSubscriptionsController,
  AdminSubscriptionPaymentsController,
];

describe('Billing controllers', () => {
  describe.each(ADMIN_CONTROLLERS.map((c) => [c.name, c] as const))(
    '%s',
    (_name, controller) => {
      it('authenticates and checks the token epoch before the platform role', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
          JwtAuthGuard,
          TokenEpochGuard,
          PlatformAdminGuard,
        ]);
      });

      it('has routes and none of them is cacheable', () => {
        const handlers = routes(controller);
        expect(handlers.length).toBeGreaterThan(0);
        for (const [, handler] of handlers)
          if (
            Reflect.getMetadata(METHOD_METADATA, handler) === RequestMethod.GET
          )
            expect(cacheControl(handler)).toBe('no-store');
      });
    },
  );

  describe('BrandSubscriptionController', () => {
    it('authenticates every route', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, BrandSubscriptionController),
      ).toEqual([JwtAuthGuard, TokenEpochGuard]);
    });

    it('requires Read(BILLING) for reads and Write(BILLING) for changes', () => {
      const handlers = routes(BrandSubscriptionController);
      expect(handlers.map(([name]) => name).sort()).toEqual(
        [
          'details',
          'paymentQuote',
          'requestPayment',
          'payments',
          'findPayment',
          'cancelPayment',
          'planChangeQuote',
          'changePlan',
          'events',
        ].sort(),
      );
      for (const [name, handler] of handlers) {
        const read =
          Reflect.getMetadata(METHOD_METADATA, handler) === RequestMethod.GET;
        expect({
          name,
          permissions: Reflect.getMetadata(PERMISSIONS_KEY, handler),
        }).toEqual({
          name,
          permissions: [read ? Read(Claim.BILLING) : Write(Claim.BILLING)],
        });
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
          PermissionGuard,
        );
      }
    });
  });

  describe('UserSubscriptionStatesController', () => {
    it('needs only an authenticated user', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, UserSubscriptionStatesController),
      ).toEqual([JwtAuthGuard, TokenEpochGuard]);
      for (const [, handler] of routes(UserSubscriptionStatesController)) {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
        expect(cacheControl(handler)).toBe('no-store');
      }
    });
  });

  describe('PublicBillingPlansController', () => {
    it('is public and cached for five minutes', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, PublicBillingPlansController) ??
          [],
      ).not.toContain(JwtAuthGuard);
      const [[, findPlans]] = routes(PublicBillingPlansController);
      expect(Reflect.getMetadata(GUARDS_METADATA, findPlans)).toBeUndefined();
      expect(cacheControl(findPlans)).toMatch(/^public, max-age=300(,|$)/);
    });
  });
});
