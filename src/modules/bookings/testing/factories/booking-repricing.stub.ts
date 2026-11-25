import { vi } from 'vitest';
import { BookingPricingContextService } from '../../services/booking-pricing-context.service.js';
import { BookingRepricingService } from '../../services/write/booking-repricing.service.js';
import { BookingRepricing } from '../../interfaces/booking-repricing.interface.js';
import { bookingPricingContextStub } from './booking-pricing-context.stub.js';

/**
 * BookingRepricingService whose plan prices nothing (resolves `plan`, null by default) while
 * bookingWrite and holdLimits run for real against `pricingContext`.
 */
export function bookingRepricingStub(
  pricingContext: BookingPricingContextService = bookingPricingContextStub(),
  plan: BookingRepricing | null = null,
): BookingRepricingService {
  const service = new BookingRepricingService(
    {} as never,
    pricingContext,
    {} as never,
  );
  vi.spyOn(service, 'plan').mockResolvedValue(plan);
  return service;
}
