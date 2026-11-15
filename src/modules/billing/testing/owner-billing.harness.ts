import { BillingSettings } from '@prisma/client';
import { vi } from 'vitest';
import { SubscriptionWithPlan } from '../interfaces/subscription-with-plan.interface.js';
import { PaymentNextActionService } from '../owner/services/payment-next-action.service.js';
import { OfflinePaymentProvider } from '../payments/offline/offline-payment.provider.js';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry.js';
import { SubscriptionAccessService } from '../subscriptions/services/subscription-access.service.js';
import { SubscriptionService } from '../subscriptions/services/subscription.service.js';
import { BillingUsageService } from '../usage/services/billing-usage.service.js';
import {
  billingSettings,
  PLANS,
  subscription,
  TX,
} from './owner-billing.fixtures.js';

/**
 * Collaborators of the owner billing services: real access, usage, locking and
 * next-action logic over mocked settings, plans, staff/location counts and db.
 * `subscription: null` is a FREE brand; the default is an ACTIVE Solo subscription.
 */
export function ownerBillingHarness(
  options: {
    subscription?: SubscriptionWithPlan | null;
    settings?: BillingSettings;
    usage?: { staff: number; locations: number };
  } = {},
) {
  const settings = options.settings ?? billingSettings();
  const settingsService = {
    get: vi.fn().mockResolvedValue(settings),
    read: vi.fn().mockResolvedValue(settings),
  };
  const plans = { findAllCached: vi.fn().mockResolvedValue(PLANS) };
  const usageCounts = options.usage ?? { staff: 1, locations: 1 };
  const staff = {
    countActiveSeats: vi.fn().mockResolvedValue(usageCounts.staff),
  };
  const locations = {
    countActive: vi.fn().mockResolvedValue(usageCounts.locations),
  };
  const access = new SubscriptionAccessService(
    {} as never,
    settingsService as never,
    plans as never,
    {} as never,
    {} as never,
  );
  const usage = new BillingUsageService(
    staff as never,
    locations as never,
    access,
  );

  const db = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)),
  };
  const subscriptions = new SubscriptionService(db as never, {} as never);
  vi.spyOn(subscriptions, 'lock').mockResolvedValue(
    options.subscription === undefined ? subscription() : options.subscription,
  );
  vi.spyOn(subscriptions, 'invalidate').mockResolvedValue(undefined);

  const links = {
    billing: vi.fn(
      (brandId: string) => `https://app/brands/${brandId}/billing`,
    ),
  };
  const nextActions = new PaymentNextActionService(
    new PaymentProviderRegistry([new OfflinePaymentProvider()]),
    settingsService as never,
    links as never,
  );

  return {
    settings,
    settingsService,
    plans,
    access,
    usage,
    db,
    subscriptions,
    nextActions,
  };
}
