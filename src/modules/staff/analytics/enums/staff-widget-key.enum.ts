export enum StaffWidgetKey {
  /**
   * Big number: how many staff members are active right now.
   * `secondaryValue` is how many were deactivated in the last 30 days — show it as a
   * small line under the number. These cards ignore the date picker and have no chart.
   */
  ACTIVE_STAFF = 'ACTIVE_STAFF',

  /**
   * Big number: the percent of active staff who have at least one shift in the current
   * week, Monday through Sunday in UTC, because shifts have no timezone.
   * `numerator` / `denominator` is "12 of 15", so the card can show the fraction next to
   * the percent. No chart and no previous period.
   */
  STAFF_UTILIZATION = 'STAFF_UTILIZATION',

  /**
   * Big number: the percent of active services that at least one active staff member can
   * perform. `numerator` / `denominator` is "8 of 10 services". A low number means some
   * services on the menu have nobody assigned. No chart and no previous period.
   */
  SERVICE_COVERAGE = 'SERVICE_COVERAGE',

  /**
   * Big number: active staff with no shift in the current week, Monday through Sunday in UTC.
   * These are the people whose week is empty. Show it as a warning count.
   * No chart and no previous period.
   */
  STAFF_WITHOUT_SHIFTS = 'STAFF_WITHOUT_SHIFTS',
}
