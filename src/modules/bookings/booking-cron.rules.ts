import { BookingStatus } from './enums/booking-status.enum.js';

export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export const AUTO_COMPLETABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

export function reminderWindow(now: Date): { from: Date; to: Date } {
  return {
    from: now,
    to: new Date(now.getTime() + REMINDER_LEAD_MS),
  };
}

export function isAutoCompletable(status: BookingStatus, endAt: Date, now: Date): boolean {
  return endAt.getTime() <= now.getTime() && AUTO_COMPLETABLE_STATUSES.includes(status);
}
