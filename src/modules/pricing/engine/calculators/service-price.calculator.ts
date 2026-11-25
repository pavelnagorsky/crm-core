import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { PricingSnapshot } from '../interfaces/pricing-snapshot.interface.js';
import { QuoteRequest } from '../interfaces/quote-request.interface.js';
import { VisitQuote } from '../interfaces/visit-quote.interface.js';
import { PriceBook } from '../price-book.js';

/** One-off quote over a snapshot; for many quotes build one PriceBook and reuse it. */
export class ServicePriceCalculator {
  private constructor() {}

  /** `today` is the location day (YYYY-MM-DD); by default the current day in its zone. */
  static quote(
    snapshot: PricingSnapshot,
    request: QuoteRequest,
    today: string = TimeUtils.zonedDateStr(new Date(), snapshot.timezone),
  ): VisitQuote {
    return new PriceBook(snapshot, today).quote(request);
  }
}
