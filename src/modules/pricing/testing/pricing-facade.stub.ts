import { vi } from 'vitest';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { pricingSnapshot } from '../engine/testing/pricing-snapshot.factory.js';
import { PricingFacade } from '../pricing.facade.js';

/**
 * A PricingFacade over a fixed snapshot, for tests that only need it injected. By default the
 * snapshot is empty, so nothing is priced and callers fall back to catalog prices.
 */
export function createPricingFacadeStub(
  snapshot: PricingSnapshot = pricingSnapshot({ services: {}, bundles: [] }),
): PricingFacade {
  return new PricingFacade({ load: vi.fn(async () => snapshot) } as never);
}
