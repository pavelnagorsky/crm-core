import { ProductLineQuote } from './product-line-quote.interface.js';
import { PromoCodeResult } from './promo-code-result.interface.js';

/** Product lines of a request and their sums, minor units. */
export interface ProductsQuote {
  lines: ProductLineQuote[];
  /** Σ listLineTotal. */
  listTotal: number;
  discountTotal: number;
  /** Σ lineTotal. */
  total: number;
  /** What the promo code did on the product lines; null without a code or context. */
  promoCode: PromoCodeResult | null;
}
