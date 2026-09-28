export enum BookingsAnalyticsWidgetKey {
  /**
   * Big number: how much of the shift time is taken by held past visits plus future confirmed
   * visits, as a percent. `metric.unit` is percent, more is better. Cancelled and no-show visits do
   * not count as occupied; future pending (unconfirmed) visits are not counted in the headline. The
   * denominator is the sum of shift hours over the period's calendar days; calendar blocks (time
   * off, breaks) are not subtracted. `breakdown` (dimension "hours") carries two items — "booked"
   * and "capacity" — in hours, so the card can show "18 of 30 hours".
   *
   * `metric.spark` is reserved hours per day or week (held + pending, a demand view), so its future
   * buckets may sit slightly above the headline, which excludes unconfirmed future visits.
   *
   * Honours a `staffId` filter but ignores `serviceId`: shift capacity is not per-service, so a
   * service-filtered numerator over unfiltered capacity would be meaningless.
   */
  OCCUPANCY = 'OCCUPANCY',

  /**
   * Big number: the share of due visits that were not disrupted — completed and confirmed visits
   * against completed + confirmed + cancelled + no-show, as a percent. Only visits whose start time
   * has passed are counted, so upcoming bookings do not dilute it. `metric.unit` is percent, more is
   * better. There is no sparkline.
   */
  VISITS_HELD = 'VISITS_HELD',

  /**
   * Big number: money lost to cancellations and no-shows in the period, using customPrice when set
   * else servicePrice. `metric.unit` is currency, growth here is a bad sign. Currency is
   * `meta.currency`. There is no breakdown and no sparkline.
   */
  LOST_REVENUE = 'LOST_REVENUE',

  /**
   * Big number: bookings still waiting to be confirmed across the period. `metric.unit` is count,
   * growth here is a bad sign. This is an action queue; it is only meaningful when the business
   * requires booking confirmation. There is no sparkline and no previous period.
   */
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
}
