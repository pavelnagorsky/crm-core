import { PromotionPeriodTotals } from './promotion-period-totals.interface.js';

/** Cards above the promotion list. */
export interface PromotionSummary {
  activeCount: number;
  scheduledCount: number;
  /** Nearest date a scheduled promotion starts; null when none is scheduled. */
  nextStartDate: string | null;
  current: PromotionPeriodTotals;
  previous: PromotionPeriodTotals;
}
