export enum ServicesAnalyticsWidgetKey {
  /**
   * Big number: how many bookings of these services were completed in the period.
   * Respects the page filters for search, category, and status.
   * `metric.spark` is a thin line of that count per day or week. More is better.
   */
  SERVICES_COMPLETED_COUNT = 'SERVICES_COMPLETED_COUNT',

  /**
   * Big number: money earned per hour of completed work. A long cheap service scores
   * lower than a short expensive one. Currency is `meta.currency`.
   * `metric.spark` is the same ratio per day or week. The points do not add up to the
   * big number. More is better.
   */
  REVENUE_PER_HOUR = 'REVENUE_PER_HOUR',

  /**
   * Horizontal bars of which services were completed most often. The top five are named;
   * everything else is one bar labeled Other. Bar height is the visit count.
   * `secondaryValue` is the money those visits brought. `sharePct` is the bar's share of
   * `breakdown.total`. There is no big number and no previous period.
   */
  SERVICES_DEMAND_BREAKDOWN = 'SERVICES_DEMAND_BREAKDOWN',
}
