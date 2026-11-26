import { vi } from 'vitest';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { QuoteContext } from '../engine/interfaces/quote-context.interface.js';
import { PricingContextRequest } from '../interfaces/pricing-context-request.interface.js';
import { PricingContextService } from '../services/pricing-context.service.js';

/**
 * PricingContextService without a database: an unknown client (or `client`), no promotion
 * uses, the rest from the request. assertLimitsHeld passes.
 */
export function pricingContextStub(
  overrides: Partial<QuoteContext> = {},
): PricingContextService {
  return {
    build: vi.fn((request: PricingContextRequest): Promise<QuoteContext> => {
      const now = request.now ?? new Date();
      return Promise.resolve({
        channel: request.channel,
        nowMs: now.getTime(),
        today: TimeUtils.zonedDateStr(now, request.timezone ?? 'UTC'),
        visitStartMs: request.visitStartAt?.getTime() ?? null,
        client: {
          known: false,
          isNew: false,
          birthday: null,
          servicesDiscountBp: null,
          productsDiscountBp: null,
        },
        promoCode: request.promoCode ?? null,
        usage: {},
        ...(request.choice && { choice: request.choice }),
        ...overrides,
      });
    }),
    assertLimitsHeld: vi.fn().mockResolvedValue(undefined),
  } as unknown as PricingContextService;
}
