import { PriceAnalyticsItemType } from '../enums/price-analytics-item-type.enum.js';
import { PriceChangeReason } from '../enums/price-change-reason.enum.js';

/** Filters of the items list and export, validated. */
export interface PriceAnalyticsFilter {
  reason?: PriceChangeReason;
  /** Only with reason PROMOTION or SURCHARGE. */
  ruleId?: string;
  /** undefined: any; null: without a staff member. */
  staffId?: string | null;
  itemType?: PriceAnalyticsItemType;
}
