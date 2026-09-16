import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, CancelledBy, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from './enums/booking-search-order-by.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';

@Injectable()
export class BookingsService {
  constructor(private readonly db: DatabaseService) {}

  async updateStatus(bookingId: string, businessId: string, dto: UpdateBookingStatusDto): Promise<Booking> {
    await this.findByIdInBusiness(bookingId, businessId);
    return this.db.booking.update({ where: { id: bookingId }, data: { status: dto.status } });
  }

  async findById(bookingId: string, businessId: string): Promise<Booking> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, businessId, deletedAt: null },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async search(businessId: string, dto: BookingSearchRequestDto): Promise<PaginatedResult<Booking>> {
    const where: Prisma.BookingWhereInput = { businessId, deletedAt: null };

    if (dto.status) where.status = dto.status;
    if (dto.staffId) where.staffId = dto.staffId;
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.startFrom || dto.startTo) {
      where.startAt = {};
      if (dto.startFrom) (where.startAt as Prisma.DateTimeFilter).gte = new Date(dto.startFrom);
      if (dto.startTo) (where.startAt as Prisma.DateTimeFilter).lte = new Date(dto.startTo);
    }

    const orderBy: Prisma.BookingOrderByWithRelationInput = {
      [dto.orderBy ?? BookingSearchOrderBy.START_AT]: dto.orderDirection ?? OrderDirection.DESC,
    };

    const findArgs: Prisma.BookingFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.booking.findMany(findArgs),
      this.db.booking.count({ where }),
    ]);

    return { items, totalItems };
  }

  async cancel(bookingId: string, businessId: string, cancelledBy: CancelledBy, dto: CancelBookingDto): Promise<Booking> {
    const booking = await this.findByIdInBusiness(bookingId, businessId);
    if (booking.status === BookingStatus.CANCELLED) {
      throw new AppException(ErrorCode.BOOKING_ALREADY_CANCELLED, HttpStatus.CONFLICT);
    }
    return this.db.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledBy,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
    });
  }

  async delete(bookingId: string, businessId: string): Promise<void> {
    const booking = await this.findByIdInBusiness(bookingId, businessId);
    await this.db.$transaction([
      this.db.booking.update({ where: { id: bookingId }, data: { deletedAt: new Date() } }),
      ...(booking.calendarEventId
        ? [this.db.calendarEvent.delete({ where: { id: booking.calendarEventId } })]
        : []),
    ]);
  }

  private async findByIdInBusiness(bookingId: string, businessId: string): Promise<Booking> {
    const booking = await this.db.booking.findFirst({
      where: { id: bookingId, businessId, deletedAt: null },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }
}
