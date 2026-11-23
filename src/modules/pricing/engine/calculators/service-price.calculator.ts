import { PricingSnapshot } from '../interfaces/pricing-snapshot.interface.js';
import { QuoteRequest } from '../interfaces/quote-request.interface.js';
import { VisitQuote } from '../interfaces/visit-quote.interface.js';
import { PriceBook } from '../price-book.js';

/** One-off quote over a snapshot; for many quotes build one PriceBook and reuse it. */
export class ServicePriceCalculator {
  private constructor() {}

  static quote(snapshot: PricingSnapshot, request: QuoteRequest): VisitQuote {
    return new PriceBook(snapshot).quote(request);
  }
}
