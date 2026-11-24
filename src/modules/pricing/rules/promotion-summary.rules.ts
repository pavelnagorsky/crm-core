import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { PromotionPeriodTotals } from '../interfaces/promotion-period-totals.interface.js';
import { PromotionSummary } from '../interfaces/promotion-summary.interface.js';

/** Cards above the promotion list from the live promotions and the totals of two periods. */
export function promotionSummary(
  views: readonly PriceRuleView[],
  current: PromotionPeriodTotals,
  previous: PromotionPeriodTotals,
): PromotionSummary {
  const scheduled = views.filter(
    (view) => view.status === PriceRuleStatus.SCHEDULED,
  );
  const starts = scheduled
    .map((view) => view.nextDate)
    .filter((date): date is string => date !== null)
    .sort();
  return {
    activeCount: views.filter((view) => view.status === PriceRuleStatus.ACTIVE)
      .length,
    scheduledCount: scheduled.length,
    nextStartDate: starts[0] ?? null,
    current,
    previous,
  };
}
