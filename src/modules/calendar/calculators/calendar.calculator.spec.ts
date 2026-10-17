import { CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { CalendarEventWithCancellations } from '../interfaces/calendar-types.interface.js';
import { CalendarCalculator } from './calendar.calculator.js';

const compute = new CalendarCalculator();
function block(
  overrides: Partial<CalendarEventWithCancellations> = {},
): CalendarEventWithCancellations {
  return {
    id: 'block',
    locationId: 'location',
    staffId: null,
    type: CalendarEventType.BLOCK,
    reason: null,
    title: null,
    notes: null,
    repeatType: CalendarEventRepeatType.NONE,
    startDateTime: new Date('2026-10-16T23:00:00Z'),
    endDateTime: new Date('2026-10-17T02:00:00Z'),
    daysMask: null,
    repeatUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledOccurrences: [],
    ...overrides,
  };
}
describe('Calendar blocking intervals', () => {
  it('includes the previous day when a one-time block runs past midnight', () => {
    const index = compute.expandBlockEvents(
      [block()],
      ['2026-10-17'],
      ['staff'],
      'UTC',
    );
    expect(index.get('staff')?.get('2026-10-17')).toEqual([
      { start: 0, end: 120 },
    ]);
  });
  it('blocks all of the requested day inside a multi-day event', () => {
    const index = compute.expandBlockEvents(
      [block({ endDateTime: new Date('2026-10-19T02:00:00Z') })],
      ['2026-10-18'],
      ['staff'],
      'UTC',
    );
    expect(index.get('staff')?.get('2026-10-18')).toEqual([
      { start: 0, end: 1440 },
    ]);
  });
  it('includes an overnight weekly occurrence that started on the previous weekday', () => {
    const index = compute.expandBlockEvents(
      [
        block({
          repeatType: CalendarEventRepeatType.WEEKLY,
          daysMask: '0000100',
        }),
      ],
      ['2026-10-24'],
      ['staff'],
      'UTC',
    );
    expect(index.get('staff')?.get('2026-10-24')).toEqual([
      { start: 0, end: 120 },
    ]);
  });
  it('respects a cancelled overnight occurrence', () => {
    const index = compute.expandBlockEvents(
      [
        block({
          repeatType: CalendarEventRepeatType.WEEKLY,
          daysMask: '0000100',
          cancelledOccurrences: [{ occurrenceDate: new Date('2026-10-23') }],
        }),
      ],
      ['2026-10-24'],
      ['staff'],
      'UTC',
    );
    expect(index.size).toBe(0);
  });
  it('splits a block on local dates in a timezone ahead of UTC', () => {
    const index = compute.expandBlockEvents(
      [block()],
      ['2026-10-17'],
      ['staff'],
      'Europe/Moscow',
    );
    expect(index.get('staff')?.get('2026-10-17')).toEqual([
      { start: 120, end: 300 },
    ]);
  });
});
