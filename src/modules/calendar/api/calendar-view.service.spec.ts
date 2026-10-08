import { CalendarViewService } from './calendar-view.service.js';

describe('CalendarViewService', () => {
  const calendar = {
    getCalendar: vi.fn(),
    getManualAvailableSlots: vi.fn(),
  };
  const bookings = {
    listForCalendar: vi.fn(),
    linkedCalendarEventIdsForBooking: vi.fn(),
  };
  const location = {
    getLocale: vi.fn().mockResolvedValue({
      timezone: 'Europe/Minsk',
      currency: 'BYN',
    }),
  };
  const service = new CalendarViewService(
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
    bookings.linkedCalendarEventIdsForBooking.mockResolvedValue([
      'event-1',
      'event-2',
    ]);
    calendar.getManualAvailableSlots.mockResolvedValue([]);
    const dto = {
      serviceId: 'service-1',
      bookingId: 'booking-1',
      from: '2026-10-01',
      to: '2026-10-02',
    };

    await service.getManualAvailableSlots('location-1', dto);

    expect(calendar.getManualAvailableSlots).toHaveBeenCalledWith(
      'location-1',
      dto,
      ['event-1', 'event-2'],
    );
  });
});
