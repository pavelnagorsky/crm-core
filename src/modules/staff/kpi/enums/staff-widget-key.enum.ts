export enum StaffWidgetKey {
  /** Active staff count, with recently deactivated as secondary signal. */
  ACTIVE_STAFF = 'ACTIVE_STAFF',
  /** % of active staff with at least one shift in the current week. */
  STAFF_UTILIZATION = 'STAFF_UTILIZATION',
  /** % of active services covered by at least one active staff member. */
  SERVICE_COVERAGE = 'SERVICE_COVERAGE',
  /** Count of active staff with no shift in the current week. */
  STAFF_WITHOUT_SHIFTS = 'STAFF_WITHOUT_SHIFTS',
}
