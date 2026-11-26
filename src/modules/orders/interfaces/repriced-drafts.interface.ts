import { ProductLinePrice } from '../../pricing/interfaces/product-line-price.interface.js';
import { ProductPriceQuote } from '../../pricing/interfaces/product-price-quote.interface.js';
import { OrderWithItems } from './order-with-items.interface.js';

/** Draft product lines of an order priced again (OrderProductPricingService.repriceDrafts). */
export interface RepricedDrafts {
  /** The order as read before the writes. */
  order: OrderWithItems;
  /** Null when the order has no draft line to price. */
  quote: ProductPriceQuote | null;
  /** Each priced draft line with its new price. */
  lines: { item: OrderWithItems['items'][number]; price: ProductLinePrice }[];
  /** Lines whose stored price, layers or choice changed. */
  repricedIds: string[];
}
