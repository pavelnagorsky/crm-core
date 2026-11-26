/** How the staff member of a priced service line was found. */
export enum BookingLineStaffSource {
  /** Named in the request (staffId, staffAssignments or items[].staffId). */
  REQUESTED = 'REQUESTED',
  /** The "any staff" rule at startAt among the free staff, as booking creation assigns. */
  ASSIGNED = 'ASSIGNED',
  /** The rule ignoring availability: no startAt, or nobody is free at it. */
  ESTIMATED = 'ESTIMATED',
}
