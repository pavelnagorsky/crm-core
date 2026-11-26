import { ProductPriceChangeDetailView } from './product-price-change-detail-view.interface.js';
import { ProductPriceChangeItemRow } from './product-price-change-item-row.interface.js';

export interface ProductPriceChangeRollbackView {
  detail: ProductPriceChangeDetailView;
  restoredCount: number;
  /** Rows not returned, with the price they had. */
  skipped: ProductPriceChangeItemRow[];
}
