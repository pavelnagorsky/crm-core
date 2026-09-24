import { BookingStatus } from './enums/booking-status.enum.js';
import { isAutoCompletable, reminderWindow, REMINDER_LEAD_MS } from './booking-cron.rules.js';

describe('booking-cron.rules', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');

  it('opens a 24-hour reminder window from now', () => {
    const { from, to } = reminderWindow(now);
    expect(from.toISOString()).toBe(now.toISOString());
    expect(to.getTime() - from.getTime()).toBe(REMINDER_LEAD_MS);
    expect(to.toISOString()).toBe('2026-09-25T12:00:00.000Z');
  });

  it('auto-completes only open bookings whose slot has ended', () => {
    const ended = new Date('2026-09-24T11:00:00.000Z');
    const upcoming = new Date('2026-09-24T13:00:00.000Z');

    expect(isAutoCompletable(BookingStatus.CONFIRMED, ended, now)).toBe(true);
    expect(isAutoCompletable(BookingStatus.PENDING, ended, now)).toBe(true);
    expect(isAutoCompletable(BookingStatus.CONFIRMED, upcoming, now)).toBe(false);
    expect(isAutoCompletable(BookingStatus.COMPLETED, ended, now)).toBe(false);
    expect(isAutoCompletable(BookingStatus.NO_SHOW, ended, now)).toBe(false);
    expect(isAutoCompletable(BookingStatus.CANCELLED, ended, now)).toBe(false);
  });
});
