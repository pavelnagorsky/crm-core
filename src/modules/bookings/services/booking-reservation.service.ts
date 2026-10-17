import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { StaffEarningsService } from '../../payroll/earnings/services/staff-earnings.service.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
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

  async reserve(input: PreparedBookingReservation): Promise<BookingWithItems> {
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
    return this.db.$transaction(async (tx) => {
      if (
        !(await this.locationService.acquireActiveOperationLock(locationId, tx))
      ) {
        throw new AppException(
          ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
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
          bookingPageId: attribution.bookingPageId,
          bookingWidgetId: attribution.bookingWidgetId,
          clientFirstName: client.firstName,
          clientLastName: client.lastName,
          clientPhone: client.phone,
          clientEmail: client.email,
          notes,
          internalNotes,
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
        include: { items: { orderBy: { sortOrder: 'asc' } } },
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
    });
  }
}
