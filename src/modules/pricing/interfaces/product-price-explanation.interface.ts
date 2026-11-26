import { PriceRuleNotApplied } from '../engine/interfaces/price-rule-not-applied.interface.js';
import { ProductPriceQuote } from './product-price-quote.interface.js';

/** A product line quote in money and the promotions that did not reach it. */
export interface ProductPriceExplanation {
  quote: ProductPriceQuote;
  notApplied: PriceRuleNotApplied[];
}
