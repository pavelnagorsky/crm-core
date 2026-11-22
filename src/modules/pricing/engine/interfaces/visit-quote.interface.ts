import { LineQuote } from './line-quote.interface.js';

/** Priced lines of one visit and their sums, in integer minor units. */
export interface VisitQuote {
  lines: LineQuote[];
  listTotal: number;
  /** Discounts that reach the total: lines with a custom price contribute none. */
  discountTotal: number;
  total: number;
}
