import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { CalendarBookingFeed } from '../../../calendar/interfaces/calendar-booking-feed.interface.js';
import { CalendarBookingView } from '../../../calendar/interfaces/calendar-booking-view.interface.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';

const CALENDAR_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
]);

const calendarItemSelect = {
  id: true,
  staffId: true,
  staffName: true,
  serviceTitle: true,
  sortOrder: true,
  chargedPrice: true,
  customPrice: true,
  startAt: true,
  endAt: true,
  calendarEventId: true,
  booking: {
    select: {
      id: true,
      status: true,
    },
  },
} satisfies Prisma.BookingItemSelect;

type CalendarItemRow = Prisma.BookingItemGetPayload<{
  select: typeof calendarItemSelect;
}>;

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
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(staffIds?.length ? { staffId: { in: staffIds } } : {}),
        booking: { deletedAt: null },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: calendarItemSelect,
    });

    return {
      bookings: this.toViews(
        rows.filter((row) => CALENDAR_VISIBLE_STATUSES.has(row.booking.status)),
      ),
      linkedEventIds: rows.flatMap((row) =>
        row.calendarEventId ? [row.calendarEventId] : [],
      ),
    };
  }

  async linkedCalendarEventIdsForBooking(
    locationId: string,
    bookingId: string,
    participantStaffId?: string,
  ): Promise<string[]> {
    const booking = await this.db.booking.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        id: bookingId,
        locationId,
        deletedAt: null,
        ...(participantStaffId
          ? { items: { some: { staffId: participantStaffId } } }
          : {}),
      },
      select: { items: { select: { calendarEventId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking.items.flatMap((item) =>
      item.calendarEventId ? [item.calendarEventId] : [],
    );
  }

  private toViews(rows: CalendarItemRow[]): CalendarBookingView[] {
    const clusters = this.clusters(rows);
    const bookingCount = new Map<string, number>();
    const staffCount = new Map<string, number>();
    for (const cluster of clusters) {
      const bookingId = cluster[0].booking.id;
      const staffKey = `${bookingId}\0${cluster[0].staffId}`;
      bookingCount.set(bookingId, (bookingCount.get(bookingId) ?? 0) + 1);
      staffCount.set(staffKey, (staffCount.get(staffKey) ?? 0) + 1);
    }

    const staffIndex = new Map<string, number>();
    return clusters.map((cluster) => {
      const bookingId = cluster[0].booking.id;
      const staffId = cluster[0].staffId;
      const staffKey = `${bookingId}\0${staffId}`;
      const index = staffIndex.get(staffKey) ?? 0;
      staffIndex.set(staffKey, index + 1);
      return this.toView(
        cluster,
        this.cardId(
          bookingId,
          staffId,
          bookingCount.get(bookingId) ?? 1,
          staffCount.get(staffKey) ?? 1,
          index,
        ),
      );
    });
  }

  private clusters(rows: CalendarItemRow[]): CalendarItemRow[][] {
    const byStaff = new Map<string, CalendarItemRow[]>();
    for (const row of rows) {
      const key = `${row.booking.id}\0${row.staffId}`;
      const group = byStaff.get(key);
      if (group) group.push(row);
      else byStaff.set(key, [row]);
    }

    const clusters: CalendarItemRow[][] = [];
    for (const group of byStaff.values()) {
      group.sort(
        (left, right) =>
          left.startAt.getTime() - right.startAt.getTime() ||
          left.id.localeCompare(right.id),
      );
      let current: CalendarItemRow[] = [];
      for (const row of group) {
        const previous = current[current.length - 1];
        if (previous && row.startAt.getTime() > previous.endAt.getTime()) {
          clusters.push(current);
          current = [];
        }
        current.push(row);
      }
      if (current.length > 0) clusters.push(current);
    }

    return clusters.sort(
      (left, right) => left[0].startAt.getTime() - right[0].startAt.getTime(),
    );
  }

  private cardId(
    bookingId: string,
    staffId: string,
    bookingClusters: number,
    staffClusters: number,
    staffIndex: number,
  ): string {
    if (bookingClusters === 1) return bookingId;
    if (staffClusters === 1) return `${bookingId}:${staffId}`;
    return `${bookingId}:${staffId}:${staffIndex}`;
  }

  private toView(rows: CalendarItemRow[], id: string): CalendarBookingView {
    const ordered = [...rows].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.startAt.getTime() - right.startAt.getTime() ||
        left.id.localeCompare(right.id),
    );
    const price = ordered.reduce(
      (sum, row) => sum.plus(row.customPrice ?? row.chargedPrice),
      MoneyUtils.decimal(0),
    );
    return {
      id,
      entityId: ordered[0].booking.id,
      staffId: ordered[0].staffId,
      staffName:
        ordered.map((row) => row.staffName.trim()).find((name) => name) ?? '',
      serviceTitles: ordered.map((row) => row.serviceTitle),
      price: MoneyUtils.format(price),
      startAt: ordered.reduce(
        (min, row) => (row.startAt < min ? row.startAt : min),
        ordered[0].startAt,
      ),
      endAt: ordered.reduce(
        (max, row) => (row.endAt > max ? row.endAt : max),
        ordered[0].endAt,
      ),
    };
  }
}
