import { PromotionFullReport } from './promotion-full-report.interface.js';
import { PromotionReportPeriodDays } from './promotion-report-period.interface.js';
import { PromotionReportPrevious } from './promotion-report-previous.interface.js';

/** The promotion page: the report, its period and the previous period (docs/pricing-stage8-api.md). */
export interface PromotionPageReport extends PromotionFullReport {
  period: PromotionReportPeriodDays;
  /** The previous 30 or 90 days; null for the period "all". */
  previous: PromotionReportPrevious | null;
}
