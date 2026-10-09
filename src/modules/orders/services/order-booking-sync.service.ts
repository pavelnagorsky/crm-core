import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { BookingWithItems } from '../../bookings/interfaces/booking-with-items.interface.js';
import { LocationService } from '../../location/location.service.js';
import { OrderProductItemDto } from '../dto/order-product-item.dto.js';
import { orderInclude } from '../constants/order-include.constant.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { OrderComputeService } from './order-compute.service.js';
import { OrderDraftService } from './order-draft.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';

@Injectable()
export class OrderBookingSyncService {
  constructor(
    private readonly locations: LocationService,
    private readonly compute: OrderComputeService,
    private readonly drafts: OrderDraftService,
    private readonly persistence: OrderPersistenceService,
  ) {}

  async syncCompletedBooking(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const existing = await tx.order.findUnique({
      where: { bookingId: booking.id },
      include: orderInclude,
    });
    const order = existing
      ? await this.updateExistingBookingOrderForSync(existing, booking, tx)
      : await this.createBookingOrderForSync(booking, actor, tx);

    const confirmedByBookingItem = new Map<string, OrderWithItems['items']>();
    for (const item of order.items) {
      if (
        item.type !== OrderItemType.SERVICE ||
        item.status !== OrderItemStatus.CONFIRMED ||
        !item.bookingItemId
      ) {
        continue;
      }
      confirmedByBookingItem.set(item.bookingItemId, [
        ...(confirmedByBookingItem.get(item.bookingItemId) ?? []),
        item,
      ]);
    }

    for (const item of booking.items) {
      const confirmedAt = new Date();
      const data = this.completedBookingServiceItemData(item, confirmedAt);
      const existing = confirmedByBookingItem.get(item.id) ?? [];
      const current = existing.find((row) =>
        this.matchesCompletedBookingServiceItem(row, data),
      );
      const stale = current
        ? existing.filter((row) => row.id !== current.id)
        : existing;

      if (stale.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: stale.map((row) => row.id) } },
          data: { status: OrderItemStatus.REVERSED },
        });
      }
      if (!current) {
        await tx.orderItem.create({
          data: {
            ...data,
            orderId: order.id,
          },
        });
      }
    }

    return this.persistence.refreshTotals(tx, booking.locationId, order.id);
  }

  async reverseCompletedBookingServices(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems | null> {
    const order = await tx.order.findUnique({
      where: { bookingId: booking.id },
      include: orderInclude,
    });
    if (!order || order.locationId !== booking.locationId) return null;
    await tx.orderItem.updateMany({
      where: {
        orderId: order.id,
        type: OrderItemType.SERVICE,
        status: OrderItemStatus.CONFIRMED,
      },
      data: { status: OrderItemStatus.REVERSED },
    });
    return this.persistence.refreshTotals(tx, booking.locationId, order.id);
  }

  async addDraftProductToBookingOrder(
    booking: BookingWithItems,
    dto: OrderProductItemDto,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    return this.addDraftProductsToBookingOrder(booking, [dto], actor, tx);
  }

  async addDraftProductsToBookingOrder(
    booking: BookingWithItems,
    items: OrderProductItemDto[],
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const order = await this.ensureBookingOrder(booking, actor, tx);
    this.assertActive(order.status);
    this.drafts.assertProductItemsCanBeAdded(order, items);
    const resolved = await this.drafts.resolveProductItems(
      booking.locationId,
      items,
      actor,
      order,
      tx,
    );
    await tx.orderItem.createMany({
      data: resolved.map((item) => ({
        orderId: order.id,
        ...item,
      })),
    });
    return this.persistence.refreshTotals(tx, booking.locationId, order.id);
  }

  private async updateExistingBookingOrderForSync(
    order: OrderWithItems,
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    if (order.locationId !== booking.locationId) {
      throw new NotFoundException('Order not found');
    }
    this.assertActive(order.status);
    await tx.order.update({
      where: { id: order.id },
      data: {
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
        occurredAt: booking.endAt,
      },
      include: orderInclude,
    });
    return order;
  }

  private async createBookingOrderForSync(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(booking.locationId);
    return tx.order.create({
      data: {
        locationId: booking.locationId,
        bookingId: booking.id,
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
        currency: location.currency,
        occurredAt: booking.endAt,
        createdById: actor.id ?? null,
        createdByName: actor.name,
      },
      include: orderInclude,
    });
  }

  private completedBookingServiceItemData(
    item: BookingWithItems['items'][number],
    confirmedAt: Date,
  ): Prisma.OrderItemUncheckedCreateWithoutOrderInput {
    const price = this.compute.priceLine(
      new Prisma.Decimal(1),
      item.chargedPrice,
      item.customPrice,
    );
    return {
      type: OrderItemType.SERVICE,
      bookingItemId: item.id,
      status: OrderItemStatus.CONFIRMED,
      catalogItemId: item.serviceId,
      title: item.serviceTitle,
      quantity: new Prisma.Decimal(1),
      listUnitPrice: price.listUnitPrice,
      customUnitPrice: price.customUnitPrice,
      unitPrice: price.unitPrice,
      lineSubtotal: price.lineSubtotal,
      discountTotal: price.discountTotal,
      lineTotal: price.lineTotal,
      sellerStaffId: item.staffId,
      sellerName: item.staffName,
      confirmedAt,
      occurredAt: item.endAt,
    };
  }

  private matchesCompletedBookingServiceItem(
    existing: OrderWithItems['items'][number],
    expected: Prisma.OrderItemUncheckedCreateWithoutOrderInput,
  ): boolean {
    return (
      existing.bookingItemId === expected.bookingItemId &&
      existing.catalogItemId === expected.catalogItemId &&
      existing.title === expected.title &&
      this.decimalEquals(existing.quantity, expected.quantity) &&
      this.decimalEquals(existing.listUnitPrice, expected.listUnitPrice) &&
      this.decimalEqualsNullable(
        existing.customUnitPrice,
        expected.customUnitPrice,
      ) &&
      this.decimalEquals(existing.unitPrice, expected.unitPrice) &&
      this.decimalEquals(existing.lineSubtotal, expected.lineSubtotal) &&
      this.decimalEquals(existing.discountTotal, expected.discountTotal) &&
      this.decimalEquals(existing.lineTotal, expected.lineTotal) &&
      existing.sellerStaffId === expected.sellerStaffId &&
      existing.sellerName === expected.sellerName &&
      this.dateEquals(existing.occurredAt, expected.occurredAt)
    );
  }

  private decimalEquals(left: Prisma.Decimal, right: unknown): boolean {
    return right !== undefined && left.equals(String(right));
  }

  private decimalEqualsNullable(
    left: Prisma.Decimal | null,
    right: unknown,
  ): boolean {
    if (left === null || right == null) return left === null && right == null;
    return left.equals(String(right));
  }

  private dateEquals(
    left: Date | null,
    right: Date | string | null | undefined,
  ): boolean {
    if (left === null || right == null) return left === null && right == null;
    return left.getTime() === new Date(right).getTime();
  }

  private async ensureBookingOrder(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(booking.locationId);
    await tx.order.upsert({
      where: { bookingId: booking.id },
      update: {
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
      },
      create: {
        locationId: booking.locationId,
        bookingId: booking.id,
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
        currency: location.currency,
        occurredAt: booking.endAt,
        createdById: actor.id ?? null,
        createdByName: actor.name,
      },
    });
    return this.persistence.findByBookingInTransaction(
      tx,
      booking.locationId,
      booking.id,
    );
  }

  private assertActive(status: OrderStatus): void {
    if (status !== OrderStatus.ACTIVE) {
      throw new AppException(ErrorCode.ORDER_NOT_ACTIVE, HttpStatus.CONFLICT);
    }
  }

  private clientName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
  }
}
