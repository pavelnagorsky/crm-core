import { CalendarViewFacade } from './calendar-view.facade.js';

describe('CalendarViewFacade', () => {
  const calendar = {
    getCalendar: vi.fn(),
    getManualAvailableSlots: vi.fn(),
    getManualRescheduleSlots: vi.fn(),
  };
  const bookings = {
    listForCalendar: vi.fn(),
    resolveForReschedule: vi.fn(),
  };
  const location = {
    getLocale: vi.fn().mockResolvedValue({
      timezone: 'Europe/Minsk',
      currency: 'BYN',
    }),
  };
  const service = new CalendarViewFacade(
    calendar as never,
    bookings as never,
    location as never,
  );

  beforeEach(() => vi.clearAllMocks());

  it('loads the booking feed before composing the calendar', async () => {
    const feed = { bookings: [], linkedEventIds: ['event-1'] };
    bookings.listForCalendar.mockResolvedValue(feed);
    calendar.getCalendar.mockResolvedValue({ events: [] });
    const dto = { from: '2026-10-01', to: '2026-10-02' };

    await service.getCalendar('location-1', dto);

    expect(bookings.listForCalendar).toHaveBeenCalledWith(
      'location-1',
      new Date('2026-09-30T21:00:00.000Z'),
      new Date('2026-10-02T21:00:00.000Z'),
      undefined,
    );
    expect(calendar.getCalendar).toHaveBeenCalledWith('location-1', dto, feed);
  });

  it('excludes the edited booking events from manual availability', async () => {
    const items = [
      {
        id: 'item-1',
        serviceId: 'service-1',
        staffId: 'staff-1',
        calendarEventId: 'event-1',
        startAt: new Date('2026-10-01T10:00:00Z'),
        endAt: new Date('2026-10-01T11:00:00Z'),
      },
      {
        id: 'item-2',
        serviceId: 'service-2',
        staffId: 'staff-2',
        calendarEventId: 'event-2',
        startAt: new Date('2026-10-01T10:00:00Z'),
        endAt: new Date('2026-10-01T11:30:00Z'),
      },
    ];
    bookings.resolveForReschedule.mockResolvedValue({
      executionMode: 'PARALLEL',
      items,
    });
    calendar.getManualRescheduleSlots.mockResolvedValue([]);
    const dto = {
      serviceId: 'service-1',
      bookingId: 'booking-1',
      from: '2026-10-01',
      to: '2026-10-02',
    };

    await service.getManualAvailableSlots('location-1', dto);

    expect(bookings.resolveForReschedule).toHaveBeenCalledWith(
      'location-1',
      'booking-1',
      undefined,
    );
    expect(calendar.getManualRescheduleSlots).toHaveBeenCalledWith(
      'location-1',
      items,
      dto.from,
      dto.to,
    );
    expect(calendar.getManualAvailableSlots).not.toHaveBeenCalled();
  });

  it('replaces one saved item even when the same service occurs twice', async () => {
    const items = ['first', 'second'].map((id, index) => ({
      id,
      serviceId: 'same-service',
      staffId: `staff-${index}`,
      calendarEventId: `event-${index}`,
      startAt: new Date('2026-11-10T10:00:00Z'),
      endAt: new Date(index ? '2026-11-10T11:30:00Z' : '2026-11-10T11:00:00Z'),
    }));
    bookings.resolveForReschedule.mockResolvedValue({
      executionMode: 'PARALLEL',
      items,
    });
    const dto = {
      bookingId: 'booking',
      from: '2026-11-10',
      to: '2026-11-11',
      itemStaffAssignments: [
        { bookingItemId: 'second', staffId: 'replacement' },
      ],
    };
    await service.getManualAvailableSlots('location', dto, 'staff-0');
    expect(bookings.resolveForReschedule).toHaveBeenCalledWith(
      'location',
      'booking',
      'staff-0',
    );
    expect(calendar.getManualRescheduleSlots).toHaveBeenCalledWith(
      'location',
      [items[0], { ...items[1], staffId: 'replacement' }],
      dto.from,
      dto.to,
    );
    expect(items[1].staffId).toBe('staff-1');
    expect(calendar.getManualAvailableSlots).not.toHaveBeenCalled();
  });

  it.each([
    {
      change: { bookingId: undefined },
      errorCode: 'BOOKING_STAFF_ASSIGNMENT_INVALID',
    },
    {
      change: { staffAssignments: [{ serviceId: 'a', staffId: 'x' }] },
      errorCode: 'BOOKING_STAFF_ASSIGNMENT_CONFLICT',
    },
    { change: { staffId: 'x' }, errorCode: 'BOOKING_PARALLEL_STAFF_REQUIRED' },
    {
      change: {
        itemStaffAssignments: [{ bookingItemId: 'foreign', staffId: 'x' }],
      },
      errorCode: 'BOOKING_STAFF_ASSIGNMENT_INVALID',
    },
    {
      change: {
        itemStaffAssignments: [
          { bookingItemId: 'first', staffId: 'x' },
          { bookingItemId: 'first', staffId: 'y' },
        ],
      },
      errorCode: 'BOOKING_STAFF_ASSIGNMENT_INVALID',
    },
  ])(
    'rejects invalid item constraints before slot calculation: %j',
    async ({ change, errorCode }) => {
      bookings.resolveForReschedule.mockResolvedValue({
        executionMode: 'PARALLEL',
        items: [
          { id: 'first', serviceId: 'a' },
          { id: 'second', serviceId: 'b' },
        ],
      });
      await expect(
        service.getManualAvailableSlots('location', {
          bookingId: 'booking',
          from: '2026-11-10',
          to: '2026-11-11',
          itemStaffAssignments: [{ bookingItemId: 'first', staffId: 'x' }],
          ...change,
        }),
      ).rejects.toMatchObject({ errorCode });
      expect(calendar.getManualRescheduleSlots).not.toHaveBeenCalled();
      expect(calendar.getManualAvailableSlots).not.toHaveBeenCalled();
    },
  );
});
