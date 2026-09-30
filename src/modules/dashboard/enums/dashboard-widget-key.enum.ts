export enum DashboardWidgetKey {
  /**
   * Big number: money from confirmed and completed bookings in the period.
   * Cancelled, pending, and no-shows are not included. Currency is `meta.currency`.
   * `metric.spark` is a thin line of that money per day or week. More is better.
   */
  REVENUE_TOTAL = 'REVENUE_TOTAL',

  /**
   * Big number: money from completed bookings only. Confirmed visits that have not
   * happened yet are left out. Currency is `meta.currency`.
   * `metric.spark` is a thin line of that money per day or week. More is better.
   */
  REVENUE_COMPLETED = 'REVENUE_COMPLETED',

  /**
   * A line chart of money from confirmed and completed bookings, one point per day or week.
   * Each point's value is `revenue`. `comparisonPoints` is the previous period, aligned by
   * index, not by date. There is no separate big number. Currency is `meta.currency`.
   */
  REVENUE_SERIES = 'REVENUE_SERIES',

  /**
   * Big number: average money per confirmed or completed booking. This is the average
   * ticket, one visit at a time. Currency is `meta.currency`. There is no sparkline.
   */
  AVG_TICKET = 'AVG_TICKET',

  /**
   * Big number: every booking in the period, whatever its status.
   * `metric.spark` is a thin line of that count per day or week. More is better.
   */
  BOOKINGS_TOTAL = 'BOOKINGS_TOTAL',

  /**
   * Big number: bookings that were actually finished.
   * `metric.spark` is a thin line of that count per day or week. More is better.
   */
  BOOKINGS_COMPLETED = 'BOOKINGS_COMPLETED',

  /**
   * Big number: bookings that were cancelled.
   * `metric.spark` is a thin line of that count per day or week. Growth here is a bad sign.
   */
  BOOKINGS_CANCELLED = 'BOOKINGS_CANCELLED',

  /**
   * Big number: bookings where the client did not show up.
   * `metric.spark` is a thin line of that count per day or week. Growth here is a bad sign.
   */
  BOOKINGS_NO_SHOW = 'BOOKINGS_NO_SHOW',

  /**
   * Big number: bookings still waiting to be confirmed.
   * `metric.spark` is a thin line of that count per day or week. Growth here is a bad sign.
   */
  BOOKINGS_PENDING = 'BOOKINGS_PENDING',

  /**
   * Stacked bars of bookings over the period, one stack per day or week.
   * Each point's keys are lowercase statuses that actually occurred, such as
   * `confirmed`, `completed`, `cancelled`, `no_show`, `pending`.
   * `comparisonPoints` is the previous period, aligned by index. There is no big number.
   */
  BOOKINGS_SERIES = 'BOOKINGS_SERIES',

  /**
   * Bars of where bookings came from, tallest first: Public page, Widget, Manual.
   * Bar height is the count. `sharePct` is that bar's share of `breakdown.total`.
   * There is no comparison with the previous period.
   */
  BOOKINGS_BY_SOURCE = 'BOOKINGS_BY_SOURCE',

  /**
   * Big number: cancelled bookings as a percent of cancelled + confirmed + completed.
   * Pending and no-shows are left out so they do not water the rate down.
   * There is no sparkline. Growth here is a bad sign.
   */
  CANCELLATION_RATE = 'CANCELLATION_RATE',

  /**
   * Big number: no-shows as a percent of no-shows + completed visits.
   * There is no sparkline. Growth here is a bad sign.
   */
  NO_SHOW_RATE = 'NO_SHOW_RATE',

  /**
   * A 7x24 grid of booking counts. `xLabels` are hours as strings "0".."23" in business
   * timezone. `yLabels` are ISO weekday numbers "1".."7" (1=Monday..7=Sunday). The frontend
   * maps both axes to localized labels. `matrix[y][x]` is the count of bookings that started
   * in that weekday-hour cell over the selected period. All statuses are counted.
   */
  BOOKINGS_HEATMAP = 'BOOKINGS_HEATMAP',

  /**
   * Bars of revenue per staff member, tallest first. `value` is the revenue from confirmed
   * and completed bookings in the period; `secondaryValue` is the count of completed bookings.
   * `sharePct` is the staff member's share of `breakdown.total`. Limited to `topN` (default 5).
   * No comparison with the previous period.
   */
  REVENUE_BY_STAFF = 'REVENUE_BY_STAFF',

  /**
   * Big number: completed bookings as a percent of all bookings in the period.
   * Denominator is all statuses combined. More is better.
   * There is no sparkline.
   */
  COMPLETION_RATE = 'COMPLETION_RATE',
}
