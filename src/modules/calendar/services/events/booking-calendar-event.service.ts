import { Injectable } from '@nestjs/common';
import {
  CalendarEvent,
  CalendarEventRepeatType,
  CalendarEventType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { BookingCalendarEventInput } from '../../interfaces/booking-calendar-event-input.interface.js';
import { CalendarEventWithCancellations } from '../../interfaces/calendar-types.interface.js';

@Injectable()
export class BookingCalendarEventService {
  constructor(private readonly db: DatabaseService) {}

  listBlockingEvents(
    locationId: string,
    staffIds: string[],
    startAt: Date,
    endAt: Date,
    excludedEventIds: string[] = [],
    tx?: Prisma.TransactionClient,
  ): Promise<CalendarEventWithCancellations[]> {
    return (tx ?? this.db).calendarEvent.findMany({
      where: {
        locationId,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        repeatType: CalendarEventRepeatType.NONE,
        startDateTime: { lte: endAt },
        endDateTime: { gte: startAt },
        ...(excludedEventIds.length ? { id: { notIn: excludedEventIds } } : {}),
      },
      include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
    });
  }

  createBookingEvent(
    input: BookingCalendarEventInput,
    tx: Prisma.TransactionClient,
  ): Promise<CalendarEvent> {
    return tx.calendarEvent.create({
      data: {
        locationId: input.locationId,
        staffId: input.staffId,
        type: CalendarEventType.BOOKING,
        repeatType: CalendarEventRepeatType.NONE,
        startDateTime: input.startAt,
        endDateTime: input.endAt,
      },
    });
  }

  async saveBookingEvent(
    input: BookingCalendarEventInput,
    tx: Prisma.TransactionClient,
  ): Promise<CalendarEvent> {
    if (!input.eventId) return this.createBookingEvent(input, tx);
    return tx.calendarEvent.update({
      where: { id: input.eventId },
      data: {
        staffId: input.staffId,
        startDateTime: input.startAt,
        endDateTime: input.endAt,
      },
    });
  }

  async deleteBookingEvents(
    eventIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (eventIds.length === 0) return;
    await tx.calendarEvent.deleteMany({ where: { id: { in: eventIds } } });
  }
}
