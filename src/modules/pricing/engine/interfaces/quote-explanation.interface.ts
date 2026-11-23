import { PriceRuleNotApplied } from './price-rule-not-applied.interface.js';
import { VisitQuote } from './visit-quote.interface.js';

/** A quote and the surcharge rules that did not apply to it (in display order). */
export interface QuoteExplanation {
  quote: VisitQuote;
  notApplied: PriceRuleNotApplied[];
}
