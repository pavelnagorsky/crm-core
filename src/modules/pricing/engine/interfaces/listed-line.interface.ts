import { PriceAdjustment } from './price-adjustment.interface.js';
import { QuoteLineRequest } from './quote-line-request.interface.js';

/** A line priced up to its list price, before discounts. Minor units. */
export interface ListedLine {
  line: QuoteLineRequest;
  basePrice: number;
  staffPrice: number;
  listPrice: number;
  /** Staff, surcharge and rounding layers. */
  adjustments: PriceAdjustment[];
}
