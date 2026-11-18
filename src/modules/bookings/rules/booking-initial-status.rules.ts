import { BookingStatus } from '../enums/booking-status.enum.js';

/** A completed visit or a no-show describes a visit that has already begun. */
const STARTED_VISIT_STATUSES: readonly BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
];

/** Whether a new booking starting at startAt may be created with this status. */
export function canHaveStatus(
  status: BookingStatus,
  startAt: Date,
  now: Date,
): boolean {
  return (
    !STARTED_VISIT_STATUSES.includes(status) ||
    startAt.getTime() <= now.getTime()
  );
}
