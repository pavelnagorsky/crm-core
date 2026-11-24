import { vi } from 'vitest';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { QuoteContext } from '../../../pricing/engine/interfaces/quote-context.interface.js';
import { BookingPricingContextRequest } from '../../interfaces/booking-pricing-context-request.interface.js';
import { BookingPricingContextService } from '../../services/booking-pricing-context.service.js';

/**
 * BookingPricingContextService without a database: an unknown client (or `client`), no promotion
 * uses, the rest from the request. assertLimitsHeld passes.
 */
export function bookingPricingContextStub(
  overrides: Partial<QuoteContext> = {},
): BookingPricingContextService {
  return {
    build: vi.fn(
      (request: BookingPricingContextRequest): Promise<QuoteContext> => {
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
            discountBp: null,
          },
          promoCode: request.promoCode ?? null,
          usage: {},
          ...(request.choice && { choice: request.choice }),
          ...overrides,
        });
      },
    ),
    assertLimitsHeld: vi.fn().mockResolvedValue(undefined),
  } as unknown as BookingPricingContextService;
}
