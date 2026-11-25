import { ServicePriceChangeSummaryView } from './service-price-change-summary-view.interface.js';

export interface ServicePriceImportResult {
  /** Null when no price changed. */
  change: ServicePriceChangeSummaryView | null;
  createdServicesCount: number;
  createdCategoriesCount: number;
  createdServiceIds: string[];
}
