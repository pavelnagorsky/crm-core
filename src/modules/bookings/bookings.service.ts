import { Injectable, NotFoundException } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from './enums/booking-search-order-by.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';

@Injectable()
export class BookingsService {
  constructor(private readonly db: DatabaseService) {}

  async create(businessId: string, dto: CreateBookingDto): Promise<Booking> {
    const [client, staff, service] = await Promise.all([
      this.db.client.findUnique({ where: { id: dto.clientId } }),
      this.db.staff.findUnique({ where: { id: dto.staffId } }),
      this.db.service.findUnique({ where: { id: dto.serviceId } }),
    ]);

    if (!client || client.businessId !== businessId) throw new NotFoundException('Client not found');
    if (!staff || staff.businessId !== businessId) throw new NotFoundException('Staff not found');
    if (!service || service.businessId !== businessId) throw new NotFoundException('Service not found');

    const startAt = new Date(dto.startAt);
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000);

    return this.db.booking.create({
      data: {
        businessId,
        staffId: dto.staffId,
        serviceId: dto.serviceId,
        clientId: dto.clientId,
        startAt,
        endAt,
        status: dto.status ?? BookingStatus.CONFIRMED,
        source: dto.source,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientPhone: client.phone,
        clientEmail: client.email ?? null,
        serviceTitle: service.title,
        serviceDuration: service.durationMinutes,
        servicePrice: service.price,
        staffName: staff.name,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateStatus(bookingId: string, businessId: string, dto: UpdateBookingStatusDto): Promise<Booking> {
    await this.findByIdInBusiness(bookingId, businessId);
    return this.db.booking.update({
      where: { id: bookingId },
      data: { status: dto.status },
    });
  }

  async findById(bookingId: string): Promise<Booking> {
    const booking = await this.db.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async search(businessId: string, dto: BookingSearchRequestDto): Promise<PaginatedResult<Booking>> {
    const where: Prisma.BookingWhereInput = { businessId };

    if (dto.status) where.status = dto.status;
    if (dto.staffId) where.staffId = dto.staffId;
    if (dto.clientId) where.clientId = dto.clientId;
    if (dto.startFrom || dto.startTo) {
      where.startAt = {};
      if (dto.startFrom) where.startAt.gte = new Date(dto.startFrom);
      if (dto.startTo) where.startAt.lte = new Date(dto.startTo);
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

  async delete(bookingId: string, businessId: string): Promise<void> {
    await this.findByIdInBusiness(bookingId, businessId);
    await this.db.booking.delete({ where: { id: bookingId } });
  }

  private async findByIdInBusiness(bookingId: string, businessId: string): Promise<Booking> {
    const booking = await this.db.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.businessId !== businessId) throw new NotFoundException('Booking not found');
    return booking;
  }
}
