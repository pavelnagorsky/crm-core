/** What a client did that staff of the location should hear about. */
export enum StaffBookingEvent {
  /** Booked online, already confirmed. */
  CREATED = 'CREATED',
  /** Booked online, waiting for staff to confirm. */
  REQUESTED = 'REQUESTED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
}
