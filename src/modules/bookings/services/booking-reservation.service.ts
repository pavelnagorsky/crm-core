import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { StaffEarningsService } from '../../payroll/earnings/services/staff-earnings.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { bookingWithItemsInclude } from '../constants/booking-with-items.include.js';
import { BookingCreationOutcome } from '../interfaces/booking-creation-outcome.interface.js';
import { BookingCreationRequest } from '../interfaces/booking-creation-request.interface.js';
import { BookingCreationResult } from '../interfaces/booking-creation-result.interface.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { PreparedBookingReservation } from '../interfaces/prepared-booking-reservation.interface.js';
import { BookingSlotLockService } from './booking-slot-lock.service.js';

@Injectable()
export class BookingReservationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locationService: LocationService,
    private readonly calendar: CalendarFacade,
    private readonly slots: BookingSlotLockService,
    private readonly orders: OrdersFacade,
    private readonly staffEarnings: StaffEarningsService,
  ) {}

  async reserveOnce(
    locationId: string,
    request: BookingCreationRequest,
    create: (tx: Prisma.TransactionClient) => Promise<BookingCreationResult>,
  ): Promise<BookingCreationOutcome> {
    return this.db.$transaction(
      async (tx) => {
        await this.lockActiveLocation(locationId, tx);
        // Lock before preparation: a retry must not resolve staff against its own occupied slot.
        const key = JSON.stringify([
          'booking-create',
          locationId,
          request.idempotencyKey,
        ]);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
        const existing = await tx.booking.findUnique({
          where: {
            locationId_idempotencyKey: {
              locationId,
              idempotencyKey: request.idempotencyKey,
            },
          },
          include: bookingWithItemsInclude,
        });
        if (existing) {
          if (
            existing.creationRequestHash !== request.creationRequestHash ||
            existing.deletedAt
          ) {
            throw new AppException(
              ErrorCode.BOOKING_IDEMPOTENCY_CONFLICT,
              HttpStatus.CONFLICT,
            );
          }
          return { booking: existing, created: false };
        }
        return { ...(await create(tx)), created: true };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 30_000,
      },
    );
  }

  async reserve(
    input: PreparedBookingReservation,
    tx?: Prisma.TransactionClient,
  ): Promise<BookingWithItems> {
    if (tx) return this.reserveInTransaction(input, tx);
    return this.db.$transaction((client) =>
      this.reserveInTransaction(input, client),
    );
  }

  private async reserveInTransaction(
    input: PreparedBookingReservation,
    tx: Prisma.TransactionClient,
  ): Promise<BookingWithItems> {
    const {
      locationId,
      timezone,
      client,
      items,
      attribution,
      executionMode,
      bundleId,
      startAt,
      endAt,
      status,
      notes,
      internalNotes,
      products: manualProducts,
      actor,
    } = input;
    await this.lockActiveLocation(locationId, tx);
    await this.slots.lockSlots(items, timezone, tx);
    await this.slots.assertSlotsAvailable(locationId, items, timezone, tx);

    const createdItems = [];
    for (const item of items) {
      const calendarEvent = await this.calendar.createBookingEvent(
        {
          locationId,
          staffId: item.staffId,
          startAt: item.startAt,
          endAt: item.endAt,
        },
        tx,
      );
      createdItems.push({ ...item, calendarEventId: calendarEvent.id });
    }

    const booking = await tx.booking.create({
      data: {
        locationId,
        clientId: client.id,
        startAt,
        endAt,
        executionMode,
        bundleId,
        status,
        source: attribution.source,
        isCustomTime: input.isCustomTime,
        notifyClient: input.notifyClient,
        ...input.clientNotice,
        bookingPageId: attribution.bookingPageId,
        bookingWidgetId: attribution.bookingWidgetId,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientPhone: client.phone,
        clientEmail: client.email,
        notes,
        internalNotes,
        idempotencyKey: input.request?.idempotencyKey ?? null,
        creationRequestHash: input.request?.creationRequestHash ?? null,
        items: {
          create: createdItems.map((item) => ({
            locationId,
            serviceId: item.serviceId,
            staffId: item.staffId,
            sortOrder: item.sortOrder,
            startAt: item.startAt,
            endAt: item.endAt,
            serviceTitle: item.serviceTitle,
            serviceDuration: item.serviceDuration,
            listPrice: item.listPrice,
            chargedPrice: item.chargedPrice,
            customPrice: item.customPrice,
            staffName: item.staffName,
            calendarEventId: item.calendarEventId,
          })),
        },
      },
      include: bookingWithItemsInclude,
    });
    const operationActor = actor ?? {
      name: 'System',
      role: AuditActorRole.SYSTEM,
    };
    if (status === BookingStatus.COMPLETED) {
      const order = await this.orders.syncCompletedBooking(
        booking,
        operationActor,
        tx,
      );
      await this.staffEarnings.recordForCompletedBooking(booking, tx, order);
      await this.staffEarnings.syncForCompletedBooking(
        booking,
        operationActor,
        tx,
        order,
      );
    }
    if (manualProducts.length > 0) {
      await this.orders.addDraftProductsToBookingOrder(
        booking,
        manualProducts,
        operationActor,
        tx,
        true,
      );
    }
    return booking;
  }

  private async lockActiveLocation(
    locationId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (
      !(await this.locationService.acquireActiveOperationLock(locationId, tx))
    ) {
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
