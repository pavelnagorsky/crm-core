import { PriceAnalyticsItem } from './price-analytics-item.interface.js';

/** Items of the list filter, newest first, with the resolved period. */
export interface PriceAnalyticsFilteredItems {
  items: PriceAnalyticsItem[];
  currency: string;
  timezone: string;
  from: Date;
  to: Date;
}
