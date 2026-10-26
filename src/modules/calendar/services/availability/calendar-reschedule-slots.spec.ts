import { CalendarEventRepeatType } from '@prisma/client';
import { CalendarCalculator } from '../../calculators/calendar.calculator.js';
import { CalendarAvailabilityService } from './calendar-availability.service.js';

function setup(parallel = false) {
  const first = {
    serviceId: 'haircut',
    staffId: 'anna',
    startAt: new Date('2026-10-28T10:00:00Z'),
    endAt: new Date('2026-10-28T10:30:00Z'),
    calendarEventId: 'old-1',
  };
  const items = [
    first,
    {
      serviceId: 'coloring',
      staffId: 'boris',
      startAt: new Date(
        parallel ? '2026-10-28T10:00:00Z' : '2026-10-28T10:30:00Z',
      ),
      endAt: new Date('2026-10-28T11:00:00Z'),
      calendarEventId: 'old-2',
    },
  ];
  const shifts = ['anna', 'boris'].map((staffId) => ({
    staffId,
    date: new Date('2026-10-29'),
    startTime: new Date('1970-01-01T09:00:00Z'),
    endTime: new Date('1970-01-01T12:00:00Z'),
  }));
  const staff = {
    resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'active' }]),
    listShiftsForStaff: vi.fn().mockResolvedValue(shifts),
  };
  const db = {
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          staffId: 'boris',
          startDateTime: new Date('2026-10-29T10:00:00Z'),
          endDateTime: new Date('2026-10-29T10:30:00Z'),
          repeatType: CalendarEventRepeatType.NONE,
          cancelledOccurrences: [],
        },
      ]),
    },
  };
  const location = {
    timezone: 'UTC',
    advanceBookingWindowDays: 7,
    slotIntervalMinutes: 30,
    minimumBookingNoticeMinutes: 60,
  };
  const locations = { findById: vi.fn().mockResolvedValue(location) };
  const service = new CalendarAvailabilityService(
    db as never,
    staff as never,
    locations as never,
    {} as never,
    new CalendarCalculator(),
  );
  return { service, items, db, staff, location };
}

describe('Available times for an existing booking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps sequential offsets and checks each assigned staff member at the right time', async () => {
    const { service, items, db } = setup();
    const days = await service.getRescheduleSlots(
      'location',
      items,
      '2026-10-29',
      '2026-10-29',
    );
    expect(days).toEqual([
      {
        date: '2026-10-29',
        slots: [
          { time: '09:00' },
          { time: '10:00' },
          { time: '10:30' },
          { time: '11:00' },
        ],
      },
    ]);
    expect(db.calendarEvent.findMany.mock.calls[0][0].where.id).toEqual({
      notIn: ['old-1', 'old-2'],
    });
  });

  it('preserves parallel starts and different durations', async () => {
    const { service, items } = setup(true);
    const days = await service.getRescheduleSlots(
      'location',
      items,
      '2026-10-29',
      '2026-10-29',
    );
    expect(days[0].slots).toEqual([
      { time: '09:00' },
      { time: '10:30' },
      { time: '11:00' },
    ]);
  });

  it('respects minimum notice across midnight', async () => {
    const { service, items, location } = setup();
    location.minimumBookingNoticeMinutes = 11 * 60;
    vi.setSystemTime(new Date('2026-10-28T23:00:00Z'));
    const days = await service.getRescheduleSlots(
      'location',
      items,
      '2026-10-29',
      '2026-10-29',
    );
    expect(days[0].slots).toEqual([
      { time: '10:00' },
      { time: '10:30' },
      { time: '11:00' },
    ]);
  });

  it('does not offer dates beyond the advance window or run unbounded queries', async () => {
    const { service, items, db } = setup();
    await expect(
      service.getRescheduleSlots('location', items, '2026-11-02', '2026-11-02'),
    ).resolves.toEqual([]);
    expect(db.calendarEvent.findMany).not.toHaveBeenCalled();
    await expect(
      service.getRescheduleSlots('location', items, '2026-10-26', '2027-01-01'),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SLOT_RANGE_TOO_LONG' });
  });

  it('does not offer times when any assigned staff member has no shift', async () => {
    const { service, items, staff } = setup();
    staff.listShiftsForStaff.mockResolvedValue([]);
    await expect(
      service.getRescheduleSlots('location', items, '2026-10-29', '2026-10-29'),
    ).resolves.toEqual([]);
  });

  it('does not offer slots for overlapping items assigned to the same staff', async () => {
    const { service, items } = setup(true);
    items[1].staffId = items[0].staffId;
    await expect(
      service.getRescheduleSlots('location', items, '2026-10-29', '2026-10-29'),
    ).resolves.toEqual([]);
  });

  it('does not offer slots when assigned staff no longer perform the service', async () => {
    const { service, items, staff, db } = setup();
    staff.resolveStaffForService.mockResolvedValue([]);
    await expect(
      service.getRescheduleSlots('location', items, '2026-10-29', '2026-10-29'),
    ).resolves.toEqual([]);
    expect(db.calendarEvent.findMany).not.toHaveBeenCalled();
  });
});
