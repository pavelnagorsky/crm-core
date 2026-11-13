import { BookingStatus } from '../enums/booking-status.enum.js';
import { reminderDueAt } from './booking-reminder.rules.js';

describe('reminderDueAt', () => {
  const confirmedAt = new Date('2026-09-20T08:00:00.000Z');
  const due = (startAt: string, status = BookingStatus.CONFIRMED) =>
    reminderDueAt(
      { status, startAt: new Date(startAt) },
      confirmedAt,
    )?.toISOString() ?? null;

  it('reminds a day before a booking made more than a day ahead', () => {
    expect(due('2026-09-23T15:00:00.000Z')).toBe('2026-09-22T15:00:00.000Z');
  });

  it('reminds two hours before a booking made within a day', () => {
    expect(due('2026-09-20T18:00:00.000Z')).toBe('2026-09-20T16:00:00.000Z');
  });

  it('does not remind a booking made six hours ahead or closer', () => {
    expect(due('2026-09-20T11:00:00.000Z')).toBeNull();
    expect(due('2026-09-20T14:00:00.000Z')).toBeNull();
  });

  it('uses the short reminder exactly one day ahead', () => {
    expect(due('2026-09-21T08:00:00.000Z')).toBe('2026-09-21T06:00:00.000Z');
  });

  it.each([
    BookingStatus.PENDING,
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
  ])('does not remind a %s booking', (status) => {
    expect(due('2026-09-23T15:00:00.000Z', status)).toBeNull();
  });
});
