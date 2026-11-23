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

describe('Calendar slot starts with free staff', () => {
  const date = '2026-11-10';
  const shiftOf = (staffId: string, from: string, to: string) => ({
    staffId,
    date: new Date(date),
    startTime: new Date(`1970-01-01T${from}:00Z`),
    endTime: new Date(`1970-01-01T${to}:00Z`),
  });
  const shiftIndex = (...shifts: ReturnType<typeof shiftOf>[]) =>
    compute.groupShiftsByStaffDate(shifts);
  const blocked = (staffId: string, start: number, end: number) =>
    new Map([[staffId, new Map([[date, [{ start, end }]]])]]);
  const noBlocks = new Map<
    string,
    Map<string, { start: number; end: number }[]>
  >();

  describe('one service', () => {
    const staff = [{ id: 'anna' }, { id: 'boris' }];
    const shifts = shiftIndex(
      shiftOf('anna', '10:00', '12:00'),
      shiftOf('boris', '10:30', '12:00'),
    );

    it('lists who is free for every slot start', () => {
      const starts = compute.collectSlotStartsForDate(
        date,
        staff,
        shifts,
        blocked('anna', 11 * 60 + 30, 12 * 60),
        0,
        60,
        30,
      );
      expect(starts).toEqual([
        { minute: 600, freeStaffIds: [['anna']] },
        { minute: 630, freeStaffIds: [['anna', 'boris']] },
        { minute: 660, freeStaffIds: [['boris']] },
      ]);
    });

    it('returns the same starts as the minutes-only API', () => {
      const args = [date, staff, shifts, noBlocks, 0, 60, 30] as const;
      expect(
        compute.collectSlotStartsForDate(...args).map((slot) => slot.minute),
      ).toEqual(compute.collectSlotsForDate(...args));
    });

    it('skips starts before the earliest minute', () => {
      const starts = compute.collectSlotStartsForDate(
        date,
        staff,
        shifts,
        noBlocks,
        11 * 60,
        60,
        30,
      );
      expect(starts.map((slot) => slot.minute)).toEqual([660]);
    });
  });

  describe('several services', () => {
    const items = [
      { serviceId: 'cut', durationMinutes: 60 },
      { serviceId: 'color', durationMinutes: 60 },
    ];
    const candidates = new Map([
      ['cut', [{ id: 'anna' }, { id: 'boris' }]],
      ['color', [{ id: 'boris' }, { id: 'carl' }]],
    ]);
    const shifts = shiftIndex(
      shiftOf('anna', '10:00', '13:00'),
      shiftOf('boris', '10:00', '13:00'),
      shiftOf('carl', '10:00', '13:00'),
    );
    const starts = (mode: string, blocks = noBlocks, earliest = 0) =>
      compute.collectMultiServiceSlotStartsForDate(
        date,
        items,
        mode,
        candidates,
        shifts,
        blocks,
        earliest,
        60,
      );

    it('lists the free staff of each item at its own time', () => {
      const result = starts('SEQUENTIAL', blocked('anna', 600, 660));
      expect(result).toEqual([
        // Anna is busy 10:00-11:00: the cut at 10:00 is Boris's, color 11:00 either of two.
        {
          minute: 600,
          freeStaffIds: [['boris'], ['boris', 'carl']],
        },
        {
          minute: 660,
          freeStaffIds: [
            ['anna', 'boris'],
            ['boris', 'carl'],
          ],
        },
      ]);
    });

    it('offers a start only when every item has someone free', () => {
      // Carl is the only color staff left and is blocked for the second hour.
      const result = starts(
        'SEQUENTIAL',
        new Map([...blocked('carl', 660, 780), ...blocked('boris', 660, 780)]),
      );
      expect(result).toEqual([]);
    });

    it('needs distinct staff in a parallel visit, and still lists every free candidate', () => {
      const parallel = starts('PARALLEL', blocked('anna', 0, 1440));
      // Cut can only be Boris; color then has to be Carl, but both are listed as free.
      expect(parallel).toEqual([
        { minute: 600, freeStaffIds: [['boris'], ['boris', 'carl']] },
        { minute: 660, freeStaffIds: [['boris'], ['boris', 'carl']] },
        { minute: 720, freeStaffIds: [['boris'], ['boris', 'carl']] },
      ]);
    });

    it('rejects a parallel start where both items could only use one staff member', () => {
      const parallel = starts(
        'PARALLEL',
        new Map([...blocked('anna', 0, 1440), ...blocked('carl', 0, 1440)]),
      );
      expect(parallel).toEqual([]);
    });

    it.each(['SEQUENTIAL', 'PARALLEL'])(
      'returns the same starts as the minutes-only API: %s',
      (mode) => {
        const blocks = blocked('boris', 660, 720);
        expect(starts(mode, blocks, 30).map((slot) => slot.minute)).toEqual(
          compute.collectMultiServiceSlotsForDate(
            date,
            items,
            mode,
            candidates,
            shifts,
            blocks,
            30,
            60,
          ),
        );
      },
    );
  });
});
