import { PriceChangeSummaryView } from './price-change-summary-view.interface.js';
import { ProductPriceChangeItemRow } from './product-price-change-item-row.interface.js';

/** A stored product price change with its rows. */
export interface ProductPriceChangeDetailView extends PriceChangeSummaryView {
  rows: ProductPriceChangeItemRow[];
}
