import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { stableOrderBy } from '../../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../../shared/enums/order-direction.enum.js';
import { PaginatedResult } from '../../../../shared/interfaces/paginated-result.interface.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { DatabaseService } from '../../../../database/database.service.js';
import { CalendarBookingFeed } from '../../../calendar/interfaces/calendar-booking-feed.interface.js';
import { BookingSearchRequestDto } from '../../dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from '../../enums/booking-search-order-by.enum.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { catalogItemMatch } from '../../utils/catalog-item-filter.js';

const CALENDAR_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
  BookingStatus.NO_SHOW,
]);

@Injectable()
export class BookingReadService {
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

  async findById(bookingId: string): Promise<BookingWithItems> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, deletedAt: null },
      include: bookingWithItemsInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async findByIdInLocation(
    locationId: string,
    bookingId: string,
  ): Promise<BookingWithItems> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, locationId, deletedAt: null },
      include: bookingWithItemsInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
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

  async search(
    locationId: string,
    dto: BookingSearchRequestDto,
  ): Promise<PaginatedResult<BookingWithItems>> {
    const where = this.buildSearchWhere(locationId, dto);
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy = dto.orderBy ?? BookingSearchOrderBy.START_AT;

    if (orderBy === BookingSearchOrderBy.PRICE) {
      return this.searchByChargedPrice(where, dto, direction);
    }

    const findArgs: Prisma.BookingFindManyArgs = {
      where,
      orderBy: stableOrderBy(this.searchOrderBy(orderBy, direction), direction),
      include: bookingWithItemsInclude,
    };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await Promise.all([
      this.db.booking.findMany(findArgs) as Promise<BookingWithItems[]>,
      this.db.booking.count({ where }),
    ]);

    return { items, totalItems };
  }

  async getStatusCounts(
    locationId: string,
  ): Promise<{ status: BookingStatus; count: number }[]> {
    const rows = await this.db.booking.groupBy({
      by: ['status'],
      where: { locationId },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      status: r.status as BookingStatus,
      count: r._count._all,
    }));
  }

  private catalogStaffFilter(
    staffIds: string[] | undefined,
    catalogItemIds: string[] | undefined,
  ): Prisma.BookingWhereInput | undefined {
    const staff = staffIds?.length ? staffIds : undefined;
    const catalogItems = catalogItemIds?.length ? catalogItemIds : undefined;
    if (staff && catalogItems) return catalogItemMatch(catalogItems, staff);
    if (staff) return { items: { some: { staffId: { in: staff } } } };
    if (catalogItems) return catalogItemMatch(catalogItems);
    return undefined;
  }

  private buildSearchWhere(
    locationId: string,
    dto: BookingSearchRequestDto,
  ): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = { locationId, deletedAt: null };

    if (dto.status) where.status = dto.status;
    if (dto.clientId) where.clientId = dto.clientId;
    const catalogFilter = this.catalogStaffFilter(
      dto.staffIds,
      dto.catalogItemIds,
    );
    if (catalogFilter) where.AND = [catalogFilter];
    if (dto.startFrom || dto.startTo) {
      where.startAt = {};
      if (dto.startFrom) {
        (where.startAt as Prisma.DateTimeFilter).gte = new Date(dto.startFrom);
      }
      if (dto.startTo) {
        (where.startAt as Prisma.DateTimeFilter).lte = new Date(dto.startTo);
      }
    }
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(
          dto.createdFrom,
        );
      }
      if (dto.createdTo) {
        (where.createdAt as Prisma.DateTimeFilter).lte = new Date(
          dto.createdTo,
        );
      }
    }
    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { clientFirstName: { contains: search, mode: 'insensitive' } },
        { clientLastName: { contains: search, mode: 'insensitive' } },
        { clientPhone: { contains: search } },
        { clientEmail: { contains: search, mode: 'insensitive' } },
        {
          items: {
            some: { serviceTitle: { contains: search, mode: 'insensitive' } },
          },
        },
        {
          items: {
            some: { staffName: { contains: search, mode: 'insensitive' } },
          },
        },
        { notes: { contains: search, mode: 'insensitive' } },
        { internalNotes: { contains: search, mode: 'insensitive' } },
        { cancellationReason: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private searchOrderBy(
    orderBy: BookingSearchOrderBy,
    direction: OrderDirection,
  ):
    | Prisma.BookingOrderByWithRelationInput
    | Prisma.BookingOrderByWithRelationInput[] {
    switch (orderBy) {
      case BookingSearchOrderBy.CLIENT_NAME:
        return [{ clientLastName: direction }, { clientFirstName: direction }];
      case BookingSearchOrderBy.SERVICE_TITLE:
        return { startAt: direction };
      case BookingSearchOrderBy.STAFF_NAME:
        return { startAt: direction };
      case BookingSearchOrderBy.STATUS:
        return { status: direction };
      case BookingSearchOrderBy.SOURCE:
        return { source: direction };
      case BookingSearchOrderBy.CREATED_AT:
        return { createdAt: direction };
      case BookingSearchOrderBy.START_AT:
        return { startAt: direction };
      case BookingSearchOrderBy.PRICE:
        throw new Error('Price sort is applied in SQL');
      default: {
        const unexpected: never = orderBy;
        throw new Error(
          `Unhandled booking search order: ${String(unexpected)}`,
        );
      }
    }
  }

  private async searchByChargedPrice(
    where: Prisma.BookingWhereInput,
    dto: BookingSearchRequestDto,
    direction: OrderDirection,
  ): Promise<PaginatedResult<BookingWithItems>> {
    const [all, totalItems] = await this.db.$transaction([
      this.db.booking.findMany({ where, include: bookingWithItemsInclude }),
      this.db.booking.count({ where }),
    ]);
    const multiplier = direction === OrderDirection.ASC ? 1 : -1;
    const ordered = all.sort((a, b) => {
      const aTotal = this.bookingChargedTotal(a);
      const bTotal = this.bookingChargedTotal(b);
      const priceOrder = aTotal.comparedTo(bTotal) * multiplier;
      return priceOrder || a.id.localeCompare(b.id) * multiplier;
    });
    const items = dto.isExport
      ? ordered
      : ordered.slice((dto.page - 1) * dto.pageSize, dto.page * dto.pageSize);
    return { items, totalItems };
  }

  private bookingChargedTotal(booking: BookingWithItems): Prisma.Decimal {
    return booking.items.reduce(
      (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
      new Prisma.Decimal(0),
    );
  }
}
