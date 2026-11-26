import { ProductQuoteLineRequest } from './product-quote-line-request.interface.js';
import { QuoteContext } from './quote-context.interface.js';
import { VisitTime } from './visit-time.interface.js';

/** Product lines of one visit order or sale (docs/pricing-stage7-api.md, "Контекст строки"). */
export interface ProductQuoteRequest {
  lines: ProductQuoteLineRequest[];
  /** Local date and minute: the visit start, or the sale moment; the price date is time.date. */
  time: VisitTime;
  /**
   * As for services; choice by line index. visitStartMs = null for a sale: lead time
   * conditions give NO_VISIT. Null: no discounts at all.
   */
  context: QuoteContext | null;
  /** List total of the other lines of the visit or sale (booking services, confirmed products), minor. */
  otherListTotal: number;
}
