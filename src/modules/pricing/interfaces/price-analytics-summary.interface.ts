import { PriceAnalyticsCounts } from './price-analytics-counts.interface.js';
import { PriceAnalyticsPeriod } from './price-analytics-period.interface.js';
import { PriceAnalyticsReasonRow } from './price-analytics-reason-row.interface.js';
import { PriceAnalyticsStaffRow } from './price-analytics-staff-row.interface.js';
import { PriceAnalyticsTotals } from './price-analytics-totals.interface.js';

/** The discounts and surcharges block of the location analytics. */
export interface PriceAnalyticsSummary {
  period: PriceAnalyticsPeriod;
  previousPeriod: PriceAnalyticsPeriod | null;
  currency: string;
  totals: PriceAnalyticsTotals;
  previousTotals: PriceAnalyticsTotals | null;
  discounts: PriceAnalyticsReasonRow[];
  surcharges: PriceAnalyticsReasonRow[];
  staff: PriceAnalyticsStaffRow[];
  /** Distinct counts over all items with any discount reason. */
  discountsCounts: PriceAnalyticsCounts;
  /** Distinct counts over all items with any surcharge reason. */
  surchargesCounts: PriceAnalyticsCounts;
}
