import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { hasStaffOverlap } from '../../../shared/scheduling/has-staff-overlap.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { ClientsService } from '../../clients/services/clients.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { StaffEarningsService } from '../../payroll/earnings/services/staff-earnings.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { bookingWithItemsInclude } from '../constants/booking-with-items.include.js';
import { BookingCreationOutcome } from '../interfaces/booking-creation-outcome.interface.js';
import { BookingCreationRequest } from '../interfaces/booking-creation-request.interface.js';
import { BookingCreationResult } from '../interfaces/booking-creation-result.interface.js';
import { BookingReservationResult } from '../interfaces/booking-reservation-result.interface.js';
import { PreparedBookingReservation } from '../interfaces/prepared-booking-reservation.interface.js';
import { reminderDueAt } from '../rules/booking-reminder.rules.js';
import { BookingSlotLockService } from './booking-slot-lock.service.js';
import { BookingPaymentService } from './write/booking-payment.service.js';

@Injectable()
export class BookingReservationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locationService: LocationService,
    private readonly calendar: CalendarFacade,
    private readonly slots: BookingSlotLockService,
    private readonly orders: OrdersFacade,
    private readonly staffEarnings: StaffEarningsService,
    private readonly clients: ClientsService,
    private readonly bookingPayment: BookingPaymentService,
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

  /**
   * An online booking without an idempotency key, in one transaction like reserveOnce: the
   * limited promotions are counted under their row lock and the booking is stored before it
   * is released.
   */
  async createInTransaction(
    locationId: string,
    create: (tx: Prisma.TransactionClient) => Promise<BookingCreationResult>,
  ): Promise<BookingCreationResult> {
    return this.db.$transaction(
      async (tx) => {
        await this.lockActiveLocation(locationId, tx);
        return create(tx);
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
  ): Promise<BookingReservationResult> {
    if (tx) return this.reserveInTransaction(input, tx);
    // A manual visit may be completed, sold and paid in the same transaction.
    return this.db.$transaction(
      (client) => this.reserveInTransaction(input, client),
      { maxWait: 5_000, timeout: 30_000 },
    );
  }

  private async reserveInTransaction(
    input: PreparedBookingReservation,
    tx: Prisma.TransactionClient,
  ): Promise<BookingReservationResult> {
    const {
      locationId,
      timezone,
      client,
      items,
      attribution,
      traffic,
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
    // The payment key is the first lock of the transaction.
    if (input.paymentPlan)
      await this.bookingPayment.lockForNewBooking(
        tx,
        locationId,
        input.paymentPlan,
      );
    await this.lockActiveLocation(locationId, tx);
    await input.limitGuard?.(tx);
    await this.slots.lockSlots(items, timezone, tx);
    // Custom time books over the schedule, as a manual interval does on update; one staff
    // member still cannot do two services of this booking at once.
    if (!input.isCustomTime)
      await this.slots.assertSlotsAvailable(locationId, items, timezone, tx);
    else if (hasStaffOverlap(items))
      throw new AppException(
        ErrorCode.BOOKING_STAFF_ASSIGNMENT_OVERLAP,
        HttpStatus.BAD_REQUEST,
      );

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
    // Saved with the booking: a failed reservation leaves the profile unchanged.
    const clientEmail =
      input.clientEmailToFill && client.id
        ? await this.clients.fillMissingEmail(
            client.id,
            input.clientEmailToFill,
            tx,
          )
        : client.email;

    const booking = await tx.booking.create({
      data: {
        locationId,
        clientId: client.id,
        startAt,
        endAt,
        executionMode,
        bundleId,
        status,
        channel: attribution.channel,
        trafficSource: traffic.source,
        trafficSourceDetail: traffic.detail,
        // Written once with an online booking: the evidence behind its source.
        trafficTouch: traffic.touch ? { create: traffic.touch } : undefined,
        isCustomTime: input.isCustomTime,
        notifyClient: input.notifyClient,
        ...input.clientNotice,
        reminderDueAt: reminderDueAt({ status, startAt }, new Date()),
        bookingPageId: attribution.bookingPageId,
        bookingWidgetId: attribution.bookingWidgetId,
        clientFirstName: client.firstName,
        clientLastName: client.lastName,
        clientPhone: client.phone,
        clientEmail,
        notes,
        internalNotes,
        promoCode: input.promoCode ?? null,
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
            basePrice: item.basePrice,
            staffPrice: item.staffPrice,
            listPrice: item.listPrice,
            discountTotal: item.discountTotal,
            chargedPrice: item.chargedPrice,
            customPrice: item.customPrice,
            priceAdjustments: { create: item.priceAdjustments },
            staffName: item.staffName,
            calendarEventId: item.calendarEventId,
          })),
        },
      },
      include: bookingWithItemsInclude,
    });
    // The first booking of a brand client tells where the client came from. Imported clients and
    // clients acquired by a concurrent booking keep theirs: the update is guarded in the row lock.
    if (client.id)
      await this.clients.recordAcquisition(
        client.id,
        {
          bookingId: booking.id,
          source: traffic.source,
          detail: traffic.detail,
          acquiredAt: booking.createdAt,
        },
        tx,
      );
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
    const productsAdded =
      manualProducts.length > 0
        ? await this.orders.addDraftProductsToBookingOrder(
            booking,
            manualProducts,
            operationActor,
            tx,
            true,
          )
        : null;
    const payment = input.paymentPlan
      ? await this.bookingPayment.applyLocked(
          tx,
          booking,
          input.paymentPlan,
          operationActor,
        )
      : null;
    return { booking: payment?.booking ?? booking, productsAdded, payment };
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
