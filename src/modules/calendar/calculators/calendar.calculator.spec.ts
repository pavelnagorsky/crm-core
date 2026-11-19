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

describe('Calendar closed time', () => {
  const shift = (staffId: string, date: string, from: string, to: string) => ({
    id: `${staffId}-${date}`,
    staffId,
    date: new Date(date),
    startTime: new Date(`1970-01-01T${from}:00Z`),
    endTime: new Date(`1970-01-01T${to}:00Z`),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('closes a staff column on a day without a shift while the location is open', () => {
    const result = compute.computeViewAndClosedTime(
      ['2026-11-20'],
      [
        shift('david', '2026-11-20', '10:00', '21:00'),
        shift('artur', '2026-11-21', '10:00', '21:00'),
      ],
      ['artur', 'david'],
    );
    expect(result).toMatchObject({ minTime: '10:00', maxTime: '21:00' });
    expect(result.closedTime).toEqual([]);
    expect(result.staffClosedTime).toEqual([
      {
        staffId: 'artur',
        date: '2026-11-20',
        startTime: '10:00',
        endTime: '21:00',
      },
    ]);
  });

  it('closes the part of the view outside a shorter shift', () => {
    const result = compute.computeViewAndClosedTime(
      ['2026-11-22'],
      [
        shift('david', '2026-11-22', '11:00', '19:00'),
        shift('vlad', '2026-11-22', '10:00', '21:00'),
      ],
      ['david', 'vlad'],
    );
    expect(result.staffClosedTime).toEqual([
      {
        staffId: 'david',
        date: '2026-11-22',
        startTime: '10:00',
        endTime: '11:00',
      },
      {
        staffId: 'david',
        date: '2026-11-22',
        startTime: '19:00',
        endTime: '21:00',
      },
    ]);
  });
});
