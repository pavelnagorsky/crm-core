import { PriceAnalyticsItem } from './price-analytics-item.interface.js';
import { PriceAnalyticsTotals } from './price-analytics-totals.interface.js';

/** What the items export writes. */
export interface PriceAnalyticsExportData {
  items: PriceAnalyticsItem[];
  totals: PriceAnalyticsTotals;
  /** The zone dates and times are written in. */
  timezone: string;
  /** First and last calendar day of the period, YYYY-MM-DD, for the file name. */
  fromDay: string;
  toDay: string;
}
