import { QuoteContext } from '../engine/interfaces/quote-context.interface.js';
import { VisitTime } from '../engine/interfaces/visit-time.interface.js';
import { ServicePriceLineRequest } from './service-price-line-request.interface.js';

/** Service lines of one visit in booking order; bundle lines in the bundle item order. */
export interface ServicePriceRequest {
  bundleId: string | null;
  lines: ServicePriceLineRequest[];
  /** Local start of the visit (its earliest item); surcharges apply by it. Null - no surcharges. */
  visit: VisitTime | null;
  /** Booking facts for promotions and the client discount; null or missing - no discounts. */
  context?: QuoteContext | null;
}
