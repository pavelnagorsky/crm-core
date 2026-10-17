import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { CalendarFacade } from '../../../calendar/calendar.facade.js';
import { LocationService } from '../../../location/services/location.service.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { StaffEarningsService } from '../../../payroll/earnings/services/staff-earnings.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingSlotLockService } from '../booking-slot-lock.service.js';
import { BookingWriteLockService } from '../booking-write-lock.service.js';

@Injectable()
export class BookingRescheduleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly calendar: CalendarFacade,
    private readonly staffService: StaffService,
    private readonly locationService: LocationService,
    private readonly orders: OrdersFacade,
    private readonly staffEarnings: StaffEarningsService,
    private readonly write: BookingWriteLockService,
    private readonly slots: BookingSlotLockService,
  ) {}

  async reschedule(
    old: BookingWithItems,
    dto: UpdateBookingDto,
    data: Prisma.BookingUpdateInput,
    actor: AuditActor,
  ): Promise<BookingWithItems> {
    if (old.items.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    const location = await this.locationService.findById(old.locationId);
    const startAt = dto.startAt
      ? TimeUtils.localToUtc(dto.startAt, location.timezone)
      : old.startAt;
    const manualInterval = dto.endAt !== undefined;
    const endAt = manualInterval
      ? TimeUtils.localToUtc(dto.endAt!, location.timezone)
      : null;
    if (endAt && endAt.getTime() <= startAt.getTime()) {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_INTERVAL,
        HttpStatus.BAD_REQUEST,
      );
    }
    const staff = dto.staffId
      ? await this.staffService.findById(dto.staffId)
      : null;
    const items = manualInterval
      ? await this.manualIntervalItems(
          old,
          old.locationId,
          startAt,
          endAt!,
          dto.staffId,
          staff?.name ?? null,
        )
      : await this.shiftItems(old, startAt, dto.staffId, staff?.name ?? null);
    return this.db.$transaction(async (tx) => {
      if (items.some((item) => item.endAt.getTime() > Date.now()))
        await this.write.lockActiveLocation(old.locationId, tx);
      await this.write.lockUnchangedBooking(tx, old);
      await this.slots.lockSlots(items, location.timezone, tx);
      if (!manualInterval)
        await this.slots.assertSlotsAvailable(
          old.locationId,
          items,
          location.timezone,
          tx,
        );
      await this.saveItemSchedule(old.locationId, items, tx);
      const updated = await tx.booking.update({
        where: { id: old.id },
        data: {
          ...data,
          startAt: new Date(
            Math.min(...items.map((item) => item.startAt.getTime())),
          ),
          endAt: new Date(
            Math.max(...items.map((item) => item.endAt.getTime())),
          ),
        },
        include: bookingWithItemsInclude,
      });
      if (old.status === BookingStatus.COMPLETED) {
        const order = await this.orders.syncCompletedBooking(
          updated,
          actor,
          tx,
        );
        await this.staffEarnings.syncForCompletedBooking(
          updated,
          actor,
          tx,
          order,
        );
      }
      return updated;
    });
  }

  async restoreBookingEvents(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { timezone } = await this.locationService.getLocale(
      booking.locationId,
    );
    await this.slots.lockSlots(booking.items, timezone, tx);
    await this.slots.assertSlotsAvailable(
      booking.locationId,
      booking.items,
      timezone,
      tx,
    );
    await this.saveItemSchedule(booking.locationId, booking.items, tx);
  }

  private async shiftItems(
    old: BookingWithItems,
    startAt: Date,
    staffId: string | undefined,
    staffName: string | null,
  ): Promise<BookingWithItems['items']> {
    const delta = startAt.getTime() - old.startAt.getTime();
    return Promise.all(
      old.items.map(async (item) => {
        await this.assertStaffCanPerform(
          old.locationId,
          item.serviceId,
          staffId,
        );
        return {
          ...item,
          staffId: staffId ?? item.staffId,
          staffName: staffName ?? item.staffName,
          startAt: new Date(item.startAt.getTime() + delta),
          endAt: new Date(item.endAt.getTime() + delta),
        };
      }),
    );
  }

  private async assertStaffCanPerform(
    locationId: string,
    serviceId: string,
    staffId?: string,
  ): Promise<void> {
    if (!staffId) return;
    const candidates = await this.staffService.resolveStaffForService(
      locationId,
      serviceId,
      staffId,
    );
    if (candidates.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
  }

  private async saveItemSchedule(
    locationId: string,
    items: BookingWithItems['items'],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const item of items) {
      const event = await this.calendar.saveBookingEvent(
        {
          eventId: item.calendarEventId,
          locationId,
          staffId: item.staffId,
          startAt: item.startAt,
          endAt: item.endAt,
        },
        tx,
      );
      await tx.bookingItem.update({
        where: { id: item.id },
        data: {
          staffId: item.staffId,
          staffName: item.staffName,
          startAt: item.startAt,
          endAt: item.endAt,
          calendarEventId: event.id,
        },
      });
    }
  }

  private async manualIntervalItems(
    old: BookingWithItems,
    locationId: string,
    startAt: Date,
    endAt: Date,
    targetStaffId: string | undefined,
    targetStaffName: string | null,
  ): Promise<BookingWithItems['items']> {
    const items = [...old.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const spans = items.map((item) => this.itemSpanMs(item));
    const totalSpan = spans.reduce((sum, span) => sum + span, 0);
    const totalActual = endAt.getTime() - startAt.getTime();
    const movedItems: BookingWithItems['items'] = [];
    let cursor = new Date(startAt);

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const staffId = targetStaffId ?? item.staffId;
      await this.assertStaffCanPerform(
        locationId,
        item.serviceId,
        targetStaffId,
      );

      const itemStart =
        old.executionMode === 'PARALLEL' ? new Date(startAt) : new Date(cursor);
      const itemEnd =
        old.executionMode === 'PARALLEL' || index === items.length - 1
          ? new Date(endAt)
          : new Date(
              itemStart.getTime() +
                Math.round((totalActual * spans[index]) / totalSpan),
            );
      if (itemEnd.getTime() <= itemStart.getTime()) {
        throw new AppException(
          ErrorCode.BOOKING_INVALID_INTERVAL,
          HttpStatus.BAD_REQUEST,
        );
      }

      movedItems.push({
        ...item,
        staffId,
        staffName: targetStaffName ?? item.staffName,
        startAt: itemStart,
        endAt: itemEnd,
      });
      cursor = new Date(itemEnd);
    }

    return movedItems;
  }

  private itemSpanMs(item: BookingWithItems['items'][number]): number {
    return Math.max(
      item.endAt.getTime() - item.startAt.getTime(),
      item.serviceDuration * 60_000,
      1,
    );
  }
}
