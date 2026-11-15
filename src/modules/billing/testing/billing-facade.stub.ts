import { vi } from 'vitest';
import { BillingFacade } from '../billing.facade.js';

/** A BillingFacade with no subscriptions: no limits, online booking open. */
export function createBillingFacadeStub(): BillingFacade {
  return {
    startSubscription: vi.fn().mockResolvedValue(undefined),
    assertUsageIncreaseAllowed: vi.fn().mockResolvedValue(undefined),
    isOnlineBookingOpen: vi.fn().mockResolvedValue(true),
    cancelOpenPayments: vi.fn().mockResolvedValue(undefined),
  } as unknown as BillingFacade;
}
