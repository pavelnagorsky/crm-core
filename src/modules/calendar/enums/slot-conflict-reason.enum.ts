/** Why a staff member cannot take a visit at the requested time. */
export enum SlotConflictReason {
  /** Another booking of the staff member overlaps the visit. */
  BOOKING = 'BOOKING',
  /** A block (break, day off, location-wide closure) overlaps the visit. */
  BLOCK = 'BLOCK',
  /** No shift that day, or the visit runs outside the shift or past midnight. */
  OUTSIDE_SCHEDULE = 'OUTSIDE_SCHEDULE',
  /** Several staff members could do it but none is free, no one performs it, or no distinct team fits. */
  NO_STAFF = 'NO_STAFF',
}
