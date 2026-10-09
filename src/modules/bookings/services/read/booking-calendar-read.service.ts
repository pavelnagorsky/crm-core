import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../../database/database.service.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { CalendarBookingFeed } from '../../../calendar/interfaces/calendar-booking-feed.interface.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';

const CALENDAR_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
]);

@Injectable()
export class BookingCalendarReadService {
  constructor(private readonly db: DatabaseService) {}

  async listForCalendar(
    locationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffIds?: string[],
  ): Promise<CalendarBookingFeed> {
    const rows = await this.db.bookingItem.findMany({
      where: {
        locationId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(staffIds?.length ? { staffId: { in: staffIds } } : {}),
        booking: { deletedAt: null },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        staffId: true,
        staffName: true,
        serviceTitle: true,
        chargedPrice: true,
        customPrice: true,
        startAt: true,
        endAt: true,
        calendarEventId: true,
        booking: {
          select: {
            id: true,
            clientFirstName: true,
            clientLastName: true,
            status: true,
          },
        },
      },
    });

    return {
      bookings: rows
        .filter((row) => CALENDAR_VISIBLE_STATUSES.has(row.booking.status))
        .map((row) => ({
          id: row.booking.id,
          staffId: row.staffId,
          staffName: row.staffName,
          clientFirstName: row.booking.clientFirstName,
          clientLastName: row.booking.clientLastName,
          serviceTitle: row.serviceTitle,
          servicePrice: MoneyService.format(row.chargedPrice),
          customPrice:
            row.customPrice == null
              ? null
              : MoneyService.format(row.customPrice),
          startAt: row.startAt,
          endAt: row.endAt,
        })),
      linkedEventIds: rows.flatMap((row) =>
        row.calendarEventId ? [row.calendarEventId] : [],
      ),
    };
  }

  async linkedCalendarEventIdsForBooking(
    locationId: string,
    bookingId: string,
  ): Promise<string[]> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, locationId, deletedAt: null },
      select: { items: { select: { calendarEventId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking.items.flatMap((item) =>
      item.calendarEventId ? [item.calendarEventId] : [],
    );
  }
}
