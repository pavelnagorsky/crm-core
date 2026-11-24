import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';

/** A visit to staff: the priced services at a local start, and who is wanted. */
export interface StaffingPreviewRequest {
  /** One service, or the items of the bundle in bundle order. */
  serviceIds: string[];
  bundleId: string | null;
  /** The staff member asked for; null: "any staff". */
  staffId: string | null;
  /** Local date YYYY-MM-DD. */
  date: string;
  /** Local start HH:mm. */
  time: string;
  /** Prices the candidates for the "any staff" ranking. */
  book: PriceBook;
  /** Discounts may depend on the staff member: candidates rank by the discounted price. */
  context?: QuoteContext | null;
}
