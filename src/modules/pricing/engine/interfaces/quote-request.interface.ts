import { QuoteLineRequest } from './quote-line-request.interface.js';
import { VisitTime } from './visit-time.interface.js';

/** Service lines of one visit, in booking order. */
export interface QuoteRequest {
  /** Bundle the lines come from, in the bundle's item order; null for separate services. */
  bundleId: string | null;
  lines: QuoteLineRequest[];
  /** Local start of the visit; surcharges apply by it to every line. Null - no surcharges. */
  visit: VisitTime | null;
}
