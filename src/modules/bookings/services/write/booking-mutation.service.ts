import { HttpStatus, Injectable } from '@nestjs/common';
import { Booking, CancelledBy, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AddOrderItemsDto } from '../../../orders/dto/add-order-items.dto.js';
import { OrderProductItemDto } from '../../../orders/dto/order-product-item.dto.js';
import { OrderWithItems } from '../../../orders/interfaces/order-with-items.interface.js';
import { OrdersFacade } from '../../../orders/orders.facade.js';
import { StaffEarningsService } from '../../../payroll/earnings/services/staff-earnings.service.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { CancelBookingDto } from '../../dto/cancel-booking.dto.js';
import { UpdateBookingItemPriceDto } from '../../dto/update-booking-item-price.dto.js';
import { UpdateBookingStatusDto } from '../../dto/update-booking-status.dto.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { BookingEventsService } from '../booking-events.service.js';
import { BookingWriteLockService } from '../booking-write-lock.service.js';
import { BookingReadService } from '../read/booking-read.service.js';
import { BookingLifecycleService } from './booking-lifecycle.service.js';
import { BookingRescheduleService } from './booking-reschedule.service.js';

@Injectable()
export class BookingMutationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staffEarnings: StaffEarningsService,
    private readonly orders: OrdersFacade,
    private readonly read: BookingReadService,
    private readonly write: BookingWriteLockService,
    private readonly events: BookingEventsService,
    private readonly lifecycle: BookingLifecycleService,
    private readonly reschedule: BookingRescheduleService,
  ) {}

  async update(
    old: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingDto,
  ): Promise<BookingWithItems> {
    const bookingId = old.id;

    const manualIntervalChanging = dto.endAt !== undefined;
    const slotChanging = dto.startAt !== undefined || dto.staffId !== undefined;
    const pricePatches = this.pricePatches(old, dto);
    const updateArgs = {
      where: { id: bookingId },
      data: {
        clientFirstName: dto.firstName ?? old.clientFirstName,
        clientLastName: dto.lastName ?? old.clientLastName,
        clientPhone: dto.phone ?? old.clientPhone,
        clientEmail:
          dto.email !== undefined ? (dto.email ?? null) : old.clientEmail,
        notes: dto.notes !== undefined ? (dto.notes ?? null) : undefined,
        internalNotes:
          dto.internalNotes !== undefined
            ? (dto.internalNotes ?? null)
            : undefined,
        ...this.itemPriceWrite(pricePatches),
      },
      include: bookingWithItemsInclude,
    } satisfies Prisma.BookingUpdateArgs;
    let updated: BookingWithItems;
    if (manualIntervalChanging || slotChanging) {
      updated = await this.reschedule.reschedule(
        old,
        dto,
        updateArgs.data,
        actor,
      );
    } else {
      updated = await this.db.$transaction(async (tx) => {
        await this.write.lockUnchangedBooking(tx, old);
        const result = await tx.booking.update(updateArgs);
        if (old.status === BookingStatus.COMPLETED && pricePatches.length > 0) {
          const order = await this.orders.syncCompletedBooking(
            result,
            actor,
            tx,
          );
          await this.staffEarnings.syncForCompletedBooking(
            result,
            actor,
            tx,
            order,
          );
        }
        return result;
      });
    }

    await this.events.updated(old, updated, actor);

    return updated;
  }

  async addProduct(
    locationId: string,
    bookingId: string,
    actor: AuditActor,
    dto: OrderProductItemDto,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.addProducts(
      locationId,
      bookingId,
      actor,
      { items: [dto] },
      canOverridePrice,
    );
  }

  async addProducts(
    locationId: string,
    bookingId: string,
    actor: AuditActor,
    dto: AddOrderItemsDto,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    const booking = await this.read.findByIdInLocation(locationId, bookingId);
    return this.db.$transaction((tx) =>
      this.orders.addDraftProductsToBookingOrder(
        booking,
        dto.items,
        actor,
        tx,
        canOverridePrice,
      ),
    );
  }

  updateStatus(
    old: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingWithItems> {
    return this.lifecycle.updateStatus(old, actor, dto);
  }

  completeElapsed(now = new Date()): Promise<number> {
    return this.lifecycle.completeElapsed(now);
  }

  cancel(
    booking: BookingWithItems,
    actor: AuditActor,
    cancelledBy: CancelledBy,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.lifecycle.cancel(booking, actor, cancelledBy, dto);
  }

  delete(booking: BookingWithItems, actor: AuditActor): Promise<void> {
    return this.lifecycle.delete(booking, actor);
  }

  private pricePatches(
    old: BookingWithItems,
    dto: UpdateBookingDto,
  ): UpdateBookingItemPriceDto[] {
    const patches = dto.items ?? [];
    if (patches.length === 0) return [];
    const known = new Set(old.items.map((item) => item.id));
    for (const patch of patches) {
      if (!known.has(patch.id)) {
        throw new AppException(
          ErrorCode.BOOKING_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
    }
    return patches;
  }

  private itemPriceWrite(patches: UpdateBookingItemPriceDto[]): {
    items?: Prisma.BookingUpdateInput['items'];
  } {
    if (patches.length === 0) return {};
    return {
      items: {
        update: patches.map((patch) => ({
          where: { id: patch.id },
          data: { customPrice: patch.customPrice },
        })),
      },
    };
  }
}
