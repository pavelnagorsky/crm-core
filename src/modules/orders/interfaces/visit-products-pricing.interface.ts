import { ProductPriceQuote } from '../../pricing/interfaces/product-price-quote.interface.js';
import { ProductPricingLineView } from './product-pricing-line-view.interface.js';

/** New product lines of a visit priced in the booking context. */
export interface VisitProductsPricing {
  lines: ProductPricingLineView[];
  /** Totals and the promo code result of the product lines. */
  quote: ProductPriceQuote;
}
