import { PriceChangeSummaryView } from './price-change-summary-view.interface.js';

export interface ServicePriceImportResult {
  /** Null when no price changed. */
  change: PriceChangeSummaryView | null;
  createdServicesCount: number;
  createdCategoriesCount: number;
  createdServiceIds: string[];
}
