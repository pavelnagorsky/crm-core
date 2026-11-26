import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleView } from '../interfaces/price-rule-view.interface.js';
import { PromotionPeriodTotals } from '../interfaces/promotion-period-totals.interface.js';
import { PromotionProductStats } from '../interfaces/promotion-product-stats.interface.js';
import { PromotionSummary } from '../interfaces/promotion-summary.interface.js';
import { PromotionSummaryTotals } from '../interfaces/promotion-summary-totals.interface.js';

/** Visits and product lines (net of returns) of one period together. */
function periodTotals(
  visits: PromotionPeriodTotals,
  products: PromotionProductStats,
): PromotionSummaryTotals {
  return {
    revenue: visits.revenue.plus(products.revenue),
    discount: visits.discount.plus(products.discount),
    bookingsCount: visits.bookingsCount,
    salesCount: products.salesCount,
    newClients: visits.newClients,
  };
}

/**
 * Cards above the promotion list from the live promotions and the totals of two periods:
 * the visits (bookings module) and the product lines (docs/pricing-stage7-api.md).
 */
export function promotionSummary(
  views: readonly PriceRuleView[],
  current: PromotionPeriodTotals,
  previous: PromotionPeriodTotals,
  currentProducts: PromotionProductStats,
  previousProducts: PromotionProductStats,
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
    current: periodTotals(current, currentProducts),
    previous: periodTotals(previous, previousProducts),
  };
}
