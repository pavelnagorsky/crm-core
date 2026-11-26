import { PriceAnalyticsItem } from './price-analytics-item.interface.js';
import { PriceAnalyticsTotals } from './price-analytics-totals.interface.js';

export interface PriceAnalyticsItemsPage {
  items: PriceAnalyticsItem[];
  totalItems: number;
  /** Over all items of the filter, not the page. */
  summary: PriceAnalyticsTotals;
  currency: string;
}
