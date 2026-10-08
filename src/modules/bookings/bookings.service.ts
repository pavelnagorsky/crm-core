import { Injectable } from '@nestjs/common';
import { Booking, CancelledBy } from '@prisma/client';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { CalendarBookingFeed } from '../calendar/interfaces/calendar-booking-feed.interface.js';
import { CalendarBookingReader } from '../calendar/tokens/calendar-booking-reader.js';
import { OrderProductItemDto } from '../orders/dto/order-product-item.dto.js';
import { OrderWithItems } from '../orders/interfaces/order-with-items.interface.js';
import { BookingResolveRequestDto } from './dto/booking-resolve-request.dto.js';
import { BookingResolveResponseDto } from './dto/booking-resolve-response.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSetupResponseDto } from './dto/booking-setup-response.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { UpdateBookingDto } from './dto/update-booking.dto.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';
import { BookingMutationService } from './services/mutation/booking-mutation.service.js';
import { BookingReadService } from './services/read/booking-read.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';

@Injectable()
export class BookingsService implements CalendarBookingReader {
  constructor(
    private readonly read: BookingReadService,
    private readonly setup: BookingSetupService,
    private readonly mutation: BookingMutationService,
  ) {}

  async getBookingSetup(locationId: string): Promise<BookingSetupResponseDto> {
    return this.setup.getBookingSetup(locationId);
  }

  async resolveBookingSelection(
    locationId: string,
    dto: BookingResolveRequestDto,
  ): Promise<BookingResolveResponseDto> {
    return this.setup.resolveBookingSelection(locationId, dto);
  }

  async update(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    dto: UpdateBookingDto,
  ): Promise<BookingWithItems> {
    return this.mutation.update(locationId, bookingId, tokenPayload, dto);
  }

  async updateStatus(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingWithItems> {
    return this.mutation.updateStatus(locationId, bookingId, tokenPayload, dto);
  }

  async addProduct(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    dto: OrderProductItemDto,
  ): Promise<OrderWithItems> {
    return this.mutation.addProduct(locationId, bookingId, tokenPayload, dto);
  }

  async completeElapsed(now = new Date()): Promise<number> {
    return this.mutation.completeElapsed(now);
  }

  async listForCalendar(
    locationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    staffIds?: string[],
  ): Promise<CalendarBookingFeed> {
    return this.read.listForCalendar(
      locationId,
      rangeStart,
      rangeEnd,
      staffIds,
    );
  }

  async findById(bookingId: string): Promise<BookingWithItems> {
    return this.read.findById(bookingId);
  }

  async findByIdInLocation(
    locationId: string,
    bookingId: string,
  ): Promise<BookingWithItems> {
    return this.read.findByIdInLocation(locationId, bookingId);
  }

  async linkedCalendarEventIdsForBooking(
    locationId: string,
    bookingId: string,
  ): Promise<string[]> {
    return this.read.linkedCalendarEventIdsForBooking(locationId, bookingId);
  }

  async search(
    locationId: string,
    dto: BookingSearchRequestDto,
  ): Promise<PaginatedResult<BookingWithItems>> {
    return this.read.search(locationId, dto);
  }

  async cancel(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
    cancelledBy: CancelledBy,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.mutation.cancel(
      locationId,
      bookingId,
      tokenPayload,
      cancelledBy,
      dto,
    );
  }

  async cancelByClient(
    bookingId: string,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.mutation.cancelByClient(bookingId, dto);
  }

  async delete(
    locationId: string,
    bookingId: string,
    tokenPayload: TokenPayloadDto,
  ): Promise<void> {
    return this.mutation.delete(locationId, bookingId, tokenPayload);
  }

  async getStatusCounts(
    locationId: string,
  ): Promise<{ status: BookingStatus; count: number }[]> {
    return this.read.getStatusCounts(locationId);
  }
}
