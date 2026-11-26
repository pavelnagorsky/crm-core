import { PriceChangeSummaryView } from './price-change-summary-view.interface.js';

export interface ProductPriceImportResult {
  /** Null: the file changes no price. */
  change: PriceChangeSummaryView | null;
}
