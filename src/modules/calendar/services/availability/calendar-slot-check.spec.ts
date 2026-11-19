import { CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { CalendarCalculator } from '../../calculators/calendar.calculator.js';
import { SlotCheckRequestDto } from '../../dto/slot-check-request.dto.js';
import { SlotConflictReason } from '../../enums/slot-conflict-reason.enum.js';
import { CalendarAvailabilityService } from './calendar-availability.service.js';

const service = (id: string, durationMinutes: number, bufferMinutes = 0) => ({
  id,
  durationMinutes,
  bufferMinutes,
});

const event = (
  staffId: string | null,
  type: CalendarEventType,
  start: string,
  end: string,
) => ({
  staffId,
  type,
  startDateTime: new Date(`2026-11-20T${start}:00Z`),
  endDateTime: new Date(`2026-11-20T${end}:00Z`),
  repeatType: CalendarEventRepeatType.NONE,
  cancelledOccurrences: [],
});

function setup(options: {
  services?: ReturnType<typeof service>[];
  staff?: { id: string; services: string[] }[];
  shifts?: Record<string, [string, string]>;
  events?: ReturnType<typeof event>[];
  bundle?: { executionMode: string };
}) {
  const services = options.services ?? [service('haircut', 120)];
  const shifts = Object.entries(
    options.shifts ?? { anna: ['09:00', '18:00'] },
  ).map(([staffId, [from, to]]) => ({
    staffId,
    date: new Date('2026-11-20'),
    startTime: new Date(`1970-01-01T${from}:00Z`),
    endTime: new Date(`1970-01-01T${to}:00Z`),
  }));
  const staff = {
    listActiveWithServices: vi.fn().mockResolvedValue(
      (options.staff ?? [{ id: 'anna', services: ['haircut'] }]).map(
        (member) => ({
          id: member.id,
          staffServices: member.services.map((serviceId) => ({ serviceId })),
        }),
      ),
    ),
    listShiftsForStaff: vi.fn().mockResolvedValue(shifts),
    listShiftsForAvailability: vi.fn().mockResolvedValue(shifts),
  };
  const catalog = {
    resolveServicesForAvailability: vi.fn().mockResolvedValue(services),
    resolveBundleForAvailability: vi.fn().mockResolvedValue({
      executionMode: options.bundle?.executionMode ?? 'SEQUENTIAL',
      items: services.map((entry) => ({ service: entry })),
    }),
  };
  const db = {
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue(options.events ?? []),
    },
  };
  const locations = {
    getBookingSettings: vi
      .fn()
      .mockResolvedValue({ timezone: 'UTC', slotIntervalMinutes: 15 }),
  };
  return new CalendarAvailabilityService(
    db as never,
    staff as never,
    locations as never,
    catalog as never,
    new CalendarCalculator(),
  );
}

const request = (fields: Partial<SlotCheckRequestDto>) =>
  ({
    serviceIds: ['haircut'],
    staffId: 'anna',
    startAt: '2026-11-20T14:00:00',
    ...fields,
  }) as SlotCheckRequestDto;

describe('Manual slot check', () => {
  it('confirms a free time and returns the visit interval', async () => {
    const result = await setup({}).checkManualSlot('location', request({}));
    expect(result).toEqual({
      available: true,
      reason: null,
      staffId: null,
      conflictStart: null,
      conflictEnd: null,
      startAt: '2026-11-20T14:00:00',
      endAt: '2026-11-20T16:00:00',
    });
  });

  it('names the booking the visit runs into', async () => {
    const result = await setup({
      events: [event('anna', CalendarEventType.BOOKING, '15:30', '17:00')],
    }).checkManualSlot('location', request({}));
    expect(result).toMatchObject({
      available: false,
      reason: SlotConflictReason.BOOKING,
      staffId: 'anna',
      conflictStart: '2026-11-20T15:30:00',
      conflictEnd: '2026-11-20T17:00:00',
    });
  });

  it('reports a location-wide block and picks the earliest obstacle', async () => {
    const result = await setup({
      events: [
        event('anna', CalendarEventType.BOOKING, '15:30', '17:00'),
        event(null, CalendarEventType.BLOCK, '14:30', '15:00'),
      ],
    }).checkManualSlot('location', request({}));
    expect(result).toMatchObject({
      reason: SlotConflictReason.BLOCK,
      conflictStart: '2026-11-20T14:30:00',
      conflictEnd: '2026-11-20T15:00:00',
    });
  });

  it('reports the part of the visit after the shift ends', async () => {
    const result = await setup({
      shifts: { anna: ['09:00', '15:00'] },
    }).checkManualSlot('location', request({}));
    expect(result).toMatchObject({
      reason: SlotConflictReason.OUTSIDE_SCHEDULE,
      conflictStart: '2026-11-20T15:00:00',
      conflictEnd: '2026-11-20T16:00:00',
    });
  });

  it('reports a day without a shift and a visit past midnight', async () => {
    const off = await setup({ shifts: {} }).checkManualSlot(
      'location',
      request({}),
    );
    expect(off).toMatchObject({
      reason: SlotConflictReason.NO_SHIFT,
      conflictStart: '2026-11-20T14:00:00',
      conflictEnd: '2026-11-20T16:00:00',
    });
    const late = await setup({
      shifts: { anna: ['09:00', '23:59'] },
    }).checkManualSlot('location', request({ startAt: '2026-11-20T23:00:00' }));
    expect(late).toMatchObject({
      reason: SlotConflictReason.OUTSIDE_SCHEDULE,
      endAt: '2026-11-21T01:00:00',
      conflictEnd: '2026-11-21T01:00:00',
    });
  });

  it('checks each service of a sequence at its own time', async () => {
    const result = await setup({
      services: [service('haircut', 60), service('coloring', 60, 30)],
      staff: [
        { id: 'anna', services: ['haircut'] },
        { id: 'boris', services: ['coloring'] },
      ],
      shifts: { anna: ['09:00', '18:00'], boris: ['09:00', '18:00'] },
      events: [event('boris', CalendarEventType.BOOKING, '14:00', '15:00')],
    }).checkManualSlot(
      'location',
      request({
        staffId: undefined,
        serviceIds: ['haircut', 'coloring'],
      }),
    );
    expect(result).toMatchObject({
      available: true,
      endAt: '2026-11-20T16:30:00',
    });
  });

  it('accepts any free staff member and reports NO_STAFF when all are busy', async () => {
    const options = {
      staff: [
        { id: 'anna', services: ['haircut'] },
        { id: 'boris', services: ['haircut'] },
      ],
      shifts: {
        anna: ['09:00', '18:00'] as [string, string],
        boris: ['09:00', '18:00'] as [string, string],
      },
    };
    expect(
      await setup({
        ...options,
        events: [event('anna', CalendarEventType.BOOKING, '14:00', '15:00')],
      }).checkManualSlot('location', request({ staffId: undefined })),
    ).toMatchObject({ available: true });
    expect(
      await setup({
        ...options,
        events: [event(null, CalendarEventType.BLOCK, '13:00', '19:00')],
      }).checkManualSlot('location', request({ staffId: undefined })),
    ).toMatchObject({
      available: false,
      reason: SlotConflictReason.NO_STAFF,
      staffId: null,
      conflictStart: null,
    });
  });

  it('checks only the start for one booking step without services', async () => {
    const options = {
      staff: [
        { id: 'anna', services: ['haircut'] },
        { id: 'owner', services: [] },
      ],
      events: [event('anna', CalendarEventType.BOOKING, '14:15', '15:00')],
    };
    const free = await setup(options).checkManualSlot(
      'location',
      request({ serviceIds: undefined }),
    );
    expect(free).toMatchObject({
      available: true,
      endAt: '2026-11-20T14:15:00',
    });
    const busy = await setup(options).checkManualSlot(
      'location',
      request({ serviceIds: undefined, startAt: '2026-11-20T14:15:00' }),
    );
    expect(busy).toMatchObject({
      available: false,
      reason: SlotConflictReason.BOOKING,
      staffId: 'anna',
    });
    // Without a staff member only those who perform services count.
    const off = await setup({ ...options, shifts: {} }).checkManualSlot(
      'location',
      request({ serviceIds: undefined, staffId: undefined }),
    );
    expect(off).toMatchObject({
      reason: SlotConflictReason.NO_SHIFT,
      staffId: 'anna',
      conflictStart: '2026-11-20T14:00:00',
      conflictEnd: '2026-11-20T14:15:00',
    });
  });

  it('needs distinct free staff for a parallel bundle', async () => {
    const result = await setup({
      services: [service('haircut', 60), service('manicure', 60)],
      staff: [{ id: 'anna', services: ['haircut', 'manicure'] }],
      bundle: { executionMode: 'PARALLEL' },
    }).checkManualSlot(
      'location',
      request({ staffId: undefined, serviceIds: undefined, bundleId: 'b1' }),
    );
    expect(result).toMatchObject({
      available: false,
      reason: SlotConflictReason.NO_STAFF,
      endAt: '2026-11-20T15:00:00',
    });
  });
});

describe('Manual free starts without services', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-20T00:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  it('lists starts where the staff member is free for one booking step', async () => {
    const days = await setup({
      shifts: { anna: ['09:00', '10:00'] },
      events: [event('anna', CalendarEventType.BOOKING, '09:15', '09:45')],
    }).getManualAvailableSlots('location', {
      staffId: 'anna',
      from: '2026-11-20',
      to: '2026-11-20',
    });
    expect(days).toEqual([
      { date: '2026-11-20', slots: [{ time: '09:00' }, { time: '09:45' }] },
    ]);
  });

  it('rejects a staff member from another location', async () => {
    await expect(
      setup({}).getManualAvailableSlots('location', {
        staffId: 'stranger',
        from: '2026-11-20',
        to: '2026-11-20',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
