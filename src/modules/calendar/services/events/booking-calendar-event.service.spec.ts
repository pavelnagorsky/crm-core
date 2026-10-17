import { CalendarEventRepeatType } from '@prisma/client';
import { BookingCalendarEventService } from './booking-calendar-event.service.js';

it('fetches both one-time and recurring blocks during the booking transaction', async () => {
  const tx = { calendarEvent: { findMany: vi.fn().mockResolvedValue([]) } };
  const service = new BookingCalendarEventService({} as never);
  await service.listBlockingEvents(
    'location',
    ['staff'],
    new Date('2026-10-17T10:00Z'),
    new Date('2026-10-17T11:00Z'),
    ['own-event'],
    tx as never,
  );
  const { where } = tx.calendarEvent.findMany.mock.calls[0][0];
  expect(where.id).toEqual({ notIn: ['own-event'] });
  expect(where.AND[1].OR).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ repeatType: CalendarEventRepeatType.NONE }),
      expect.objectContaining({
        repeatType: { not: CalendarEventRepeatType.NONE },
      }),
    ]),
  );
});
