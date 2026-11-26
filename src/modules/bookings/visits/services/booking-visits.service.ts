import { Injectable } from '@nestjs/common';
import {
  BookingChannel,
  BookingItemPriceAdjustment,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { visitServicesDue } from '../../rules/visit-payment-due.rules.js';
import { BookingVisit } from '../interfaces/booking-visit.interface.js';
import { VisitPaymentFacts } from '../interfaces/visit-payment-facts.interface.js';
import { VisitPricingFacts } from '../interfaces/visit-pricing-facts.interface.js';
import { PromotionChannel } from '../../../pricing/engine/enums/promotion-channel.enum.js';

@Injectable()
export class BookingVisitsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Price layers of booking items by item id, in layer order. Read in the caller's
   * transaction: a booking created as completed syncs its order before it commits.
   */
  async priceAdjustmentsByItem(
    tx: Prisma.TransactionClient,
    bookingItemIds: readonly string[],
  ): Promise<Map<string, BookingItemPriceAdjustment[]>> {
    const byItem = new Map<string, BookingItemPriceAdjustment[]>();
    if (bookingItemIds.length === 0) return byItem;
    const rows = await tx.bookingItemPriceAdjustment.findMany({
      where: { bookingItemId: { in: [...bookingItemIds] } },
      orderBy: [{ bookingItemId: 'asc' }, { sortOrder: 'asc' }],
    });
    for (const row of rows)
      byItem.set(row.bookingItemId, [
        ...(byItem.get(row.bookingItemId) ?? []),
        row,
      ]);
    return byItem;
  }

  /**
   * Payment facts of the visit behind a visit order, read under a FOR SHARE lock of the
   * booking row that holds until the caller's transaction ends. Booking writers (payment,
   * edit, delete) lock the row FOR UPDATE, so the facts stay true while the caller works on
   * the order; callers take this lock before the order lock (booking, then order). Deleted
   * bookings are included. Null when the booking is gone.
   */
  async lockForOrder(
    tx: Prisma.TransactionClient,
    locationId: string,
    bookingId: string,
  ): Promise<VisitPaymentFacts | null> {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} AND "locationId" = ${locationId} FOR SHARE`;
    if (rows.length === 0) return null;
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        status: true,
        deletedAt: true,
        items: {
          select: { chargedPrice: true, customPrice: true, staffId: true },
        },
      },
    });
    return {
      deleted: booking.deletedAt !== null,
      servicesDue: visitServicesDue(booking),
      staffIds: [...new Set(booking.items.map((item) => item.staffId))],
    };
  }

  /**
   * Start of each booking of the location by id, deleted bookings included: payment tracking
   * judges a visit order by its visit start, as the finance summary does. Absent: no booking.
   */
  async startAtByBookingIds(
    locationId: string,
    bookingIds: readonly string[],
  ): Promise<Map<string, Date>> {
    if (bookingIds.length === 0) return new Map();
    const bookings = await this.db.booking.findMany({
      where: { id: { in: [...new Set(bookingIds)] }, locationId },
      select: { id: true, startAt: true },
    });
    return new Map(bookings.map((booking) => [booking.id, booking.startAt]));
  }

  /**
   * Context of the product lines of a visit order: start, booking moment, channel, client,
   * promo code and the list total of the services. Deleted bookings are included (their
   * order keeps its lines). Null when the booking is gone.
   */
  async pricingFacts(
    client: Prisma.TransactionClient,
    locationId: string,
    bookingId: string,
  ): Promise<VisitPricingFacts | null> {
    const booking = await client.booking.findFirst({
      where: { id: bookingId, locationId },
      select: {
        id: true,
        startAt: true,
        createdAt: true,
        channel: true,
        clientId: true,
        promoCode: true,
        items: { select: { listPrice: true } },
      },
    });
    if (!booking) return null;
    return {
      bookingId: booking.id,
      startAt: booking.startAt,
      createdAt: booking.createdAt,
      channel:
        booking.channel === BookingChannel.MANUAL
          ? PromotionChannel.ADMIN
          : PromotionChannel.ONLINE,
      clientId: booking.clientId,
      promoCode: booking.promoCode,
      servicesListTotal: booking.items.reduce(
        (sum, item) => sum.plus(item.listPrice),
        new Prisma.Decimal(0),
      ),
    };
  }

  /** Visits of the location's bookings by id; deleted bookings are absent. */
  async findByBookingIds(
    locationId: string,
    bookingIds: readonly string[],
  ): Promise<Map<string, BookingVisit>> {
    if (bookingIds.length === 0) return new Map();
    const bookings = await this.db.booking.findMany({
      where: { id: { in: [...bookingIds] }, locationId, deletedAt: null },
      select: {
        id: true,
        startAt: true,
        items: {
          select: { serviceId: true, serviceTitle: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return new Map(
      bookings.map((booking) => [
        booking.id,
        {
          startAt: booking.startAt,
          services: booking.items.map((item) => ({
            id: item.serviceId,
            name: item.serviceTitle,
          })),
        },
      ]),
    );
  }
}
