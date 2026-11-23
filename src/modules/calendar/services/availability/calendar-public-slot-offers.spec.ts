import { BookingVisibility, CalendarEventRepeatType } from '@prisma/client';
import { CalendarCalculator } from '../../calculators/calendar.calculator.js';
import { CalendarAvailabilityService } from './calendar-availability.service.js';

const TODAY = '2026-11-10';

function setup(
  settings: Partial<{
    bookingVisibility: BookingVisibility;
    minimumBookingNoticeMinutes: number;
  }> = {},
) {
  const shifts = ['anna', 'boris'].map((staffId) => ({
    staffId,
    date: new Date(TODAY),
    startTime: new Date('1970-01-01T09:00:00Z'),
    endTime: new Date('1970-01-01T12:00:00Z'),
  }));
  const staff = {
    listActiveWithServices: vi.fn().mockResolvedValue(
      ['anna', 'boris'].map((id) => ({
        id,
        staffServices: [{ serviceId: 'cut' }],
      })),
    ),
    listShiftsForAvailability: vi.fn().mockResolvedValue(shifts),
  };
  const db = {
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue([
        {
          staffId: 'boris',
          startDateTime: new Date(`${TODAY}T10:00:00Z`),
          endDateTime: new Date(`${TODAY}T11:00:00Z`),
          repeatType: CalendarEventRepeatType.NONE,
          cancelledOccurrences: [],
        },
      ]),
    },
  };
  const locations = {
    getBookingSettings: vi.fn().mockResolvedValue({
      timezone: 'UTC',
      bookingVisibility: BookingVisibility.PUBLIC,
      advanceBookingWindowDays: 1,
      slotIntervalMinutes: 60,
      minimumBookingNoticeMinutes: 0,
      ...settings,
    }),
  };
  const catalog = {
    resolveServicesForAvailability: vi
      .fn()
      .mockResolvedValue([
        { id: 'cut', durationMinutes: 60, bufferMinutes: 0 },
      ]),
  };
  const service = new CalendarAvailabilityService(
    db as never,
    staff as never,
    locations as never,
    catalog as never,
    new CalendarCalculator(),
  );
  return { service };
}

describe('CalendarAvailabilityService.getPublicSlotOffers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T08:00:00Z`));
  });
  afterEach(() => vi.useRealTimers());

  it('lists the free candidate staff of the item at every slot', async () => {
    const { service } = setup();

    const offers = await service.getPublicSlotOffers('location-1', {
      serviceId: 'cut',
    });

    expect(offers.items).toEqual([{ serviceId: 'cut', durationMinutes: 60 }]);
    expect(offers.executionMode).toBe('SEQUENTIAL');
    expect(offers.days).toEqual([
      {
        date: TODAY,
        slots: [
          { time: '09:00', freeStaffIds: [['anna', 'boris']] },
          // Boris has a block from 10:00 to 11:00.
          { time: '10:00', freeStaffIds: [['anna']] },
          { time: '11:00', freeStaffIds: [['anna', 'boris']] },
        ],
      },
    ]);
  });

  it('keeps the minimum booking notice', async () => {
    const { service } = setup({ minimumBookingNoticeMinutes: 120 });

    const offers = await service.getPublicSlotOffers('location-1', {
      serviceId: 'cut',
    });

    expect(offers.days[0].slots.map((slot) => slot.time)).toEqual([
      '10:00',
      '11:00',
    ]);
  });

  it('keeps the online booking visibility check', async () => {
    const { service } = setup({ bookingVisibility: BookingVisibility.PRIVATE });

    await expect(
      service.getPublicSlotOffers('location-1', { serviceId: 'cut' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_NOT_AVAILABLE' });
  });

  it('offers the same starts as the manual list for the same day', async () => {
    const { service } = setup();

    const offers = await service.getPublicSlotOffers('location-1', {
      serviceId: 'cut',
    });
    const manual = await service.getManualAvailableSlots('location-1', {
      serviceId: 'cut',
      from: TODAY,
      to: TODAY,
    });

    expect(
      offers.days.map((day) => ({
        date: day.date,
        slots: day.slots.map(({ time }) => ({ time })),
      })),
    ).toEqual(manual);
  });
});
