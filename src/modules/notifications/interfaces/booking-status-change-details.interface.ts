export interface BookingStatusChangeDetails {
  cancellationReason?: string | null;
  /** For a move: the start before it. */
  previousStartAt?: Date | null;
  /** Absent once there is nothing left to manage, e.g. after a cancellation. */
  manageLink?: string | null;
}
