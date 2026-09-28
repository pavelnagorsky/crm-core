export enum ClientsAnalyticsWidgetKey {
  /**
   * Big number: how many people completed their first visit in the selected period.
   * Someone added to the database who has not shown up yet is not included.
   * `metric.spark` is a thin line of those first visits per day or week.
   * A rising line means acquisition got stronger. `higherIsBetter` is true.
   */
  NEW_CLIENTS = 'NEW_CLIENTS',

  /**
   * Big number: the percent of completed visits made by people who had already
   * visited before. 70 means seven of ten visits were not a first visit.
   * `series.points` are stacked bars, each split into `new` and `returning`.
   * `comparisonPoints` is the same split for the previous period, aligned by index.
   * A new client's second visit in the same period already counts as `returning`.
   */
  REPEAT_VISIT_SHARE = 'REPEAT_VISIT_SHARE',

  /**
   * Big number: people whose last completed visit was 60 days ago or more,
   * counted at the end of the selected period. Growth here is a bad sign
   * (`higherIsBetter` is false).
   * `breakdown.items` are three bars, always in this order: 30–60, 60–90, 90+ days.
   * Bar height is how many people. `secondaryValue` is what their visit cost on average.
   * The 30–60 bar is not part of the big number, so the three bars sum to more than `metric.value`.
   */
  DORMANT_CLIENTS = 'DORMANT_CLIENTS',

  /**
   * Big number: average money one person brought in the period, adding up all their
   * completed visits. This is not the average ticket: three visits by one person count
   * as one client. Currency is `meta.currency`.
   * `metric.spark` is a thin line of the same ratio per day or week. The points do not
   * add up to the big number, because a person who came in two different weeks is in both.
   */
  REVENUE_PER_CLIENT = 'REVENUE_PER_CLIENT',
}
