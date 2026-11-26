import { PriceRuleNotApplied } from './price-rule-not-applied.interface.js';
import { ProductsQuote } from './products-quote.interface.js';

/** A product line quote and every promotion that did not reach it (surcharges never do). */
export interface ProductExplanation {
  quote: ProductsQuote;
  notApplied: PriceRuleNotApplied[];
}
