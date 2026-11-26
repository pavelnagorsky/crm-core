import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  Client,
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
  PromotionLimitPeriod,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ClientsService } from '../../clients/services/clients.service.js';
import { PriceRuleSkipReason } from '../engine/enums/price-rule-skip-reason.enum.js';
import { PromotionUsage } from '../engine/interfaces/promotion-usage.interface.js';
import { QuoteClient } from '../engine/interfaces/quote-client.interface.js';
import { QuoteContext } from '../engine/interfaces/quote-context.interface.js';
import { PricingContextRequest } from '../interfaces/pricing-context-request.interface.js';
import { PromotionLimitRow } from '../interfaces/promotion-limit-row.interface.js';
import { PromotionNotApplicable } from '../interfaces/promotion-not-applicable.interface.js';
import { PromotionUsageRow } from '../interfaces/promotion-usage-row.interface.js';

const SECONDS_PER_DAY = 86_400;
const PERIOD_DAYS: Record<PromotionLimitPeriod, number | null> = {
  ALL_TIME: null,
  YEAR: 365,
  MONTH: 30,
  WEEK: 7,
};
type EditedBooking = { id: string; createdAt: Date };

const UNKNOWN_CLIENT: QuoteClient = {
  known: false,
  isNew: false,
  birthday: null,
  servicesDiscountBp: null,
  productsDiscountBp: null,
};

/**
 * Facts the price engine needs for promotions and the client discounts of a visit or a sale
 * (docs/pricing-stage4-api.md, docs/pricing-stage7-api.md): the channel, the clock, the client
 * and how often the limited promotions were used. Bookings and orders both call it, so it
 * lives in pricing and reads their tables directly (pricing imports neither module).
 *
 * A use is a visit or a sale: a live booking with a PROMOTION layer of the rule on an item or
 * on a confirmed product line of its order, or an active sale with such a confirmed product
 * line. Drafts, voided sales and cancelled or deleted bookings do not count; a return does not
 * give the use back.
 */
@Injectable()
export class PricingContextService {
  constructor(
    private readonly db: DatabaseService,
    private readonly clients: ClientsService,
  ) {}

  async build(request: PricingContextRequest): Promise<QuoteContext> {
    const now = request.now ?? new Date();
    const db = request.tx ?? this.db;
    const edited = request.bookingId
      ? await this.editedBooking(request.bookingId, request.locationId, db)
      : null;
    const client = await this.findClient(request);
    const limited = await this.limitedPromotions(
      request.locationId,
      request.tx,
      request.lockLimits !== false,
    );
    return {
      channel: request.channel,
      nowMs: now.getTime(),
      // The booking period looks at the day of booking, the lead time at now.
      today: TimeUtils.zonedDateStr(
        request.bookedAt ?? now,
        request.timezone,
      ),
      visitStartMs: request.visitStartAt?.getTime() ?? null,
      client:
        client === undefined
          ? UNKNOWN_CLIENT
          : await this.quoteClient(client, edited, request, db),
      promoCode: request.promoCode?.trim() || null,
      usage: await this.usage(
        limited,
        client?.id ?? null,
        request.visitStartAt ?? now,
        edited?.id ?? null,
        request.orderId ?? null,
        db,
      ),
      ...(request.choice && { choice: request.choice }),
    };
  }

  /**
   * Locks the limited promotions of the location (FOR UPDATE) until the transaction ends.
   * Lock order: payment key, limited promotions, booking, slots, order. A transaction that will
   * fix product prices (confirmation) takes this lock before the booking and the order, so it
   * cannot deadlock with a booking edit that checks its limits.
   */
  async lockLimits(
    tx: Prisma.TransactionClient,
    locationId: string,
  ): Promise<void> {
    await this.limitedPromotions(locationId, tx);
  }

  /**
   * In the transaction that stores prices (a booking, a confirmed product line): the limited
   * promotions in use still have room once their rows are locked (a concurrent write of the
   * last use waits and then sees it). Otherwise 409 PROMOTION_NOT_APPLICABLE with
   * LIMIT_REACHED or CLIENT_LIMIT_REACHED. `visitStartAt` is the visit start, or the sale
   * moment of a sale; the own booking and order are not counted.
   */
  async assertLimitsHeld(
    tx: Prisma.TransactionClient,
    locationId: string,
    ruleIds: readonly (string | null)[],
    clientId: string | null,
    visitStartAt: Date,
    bookingId: string | null = null,
    orderId: string | null = null,
  ): Promise<void> {
    const used = new Set(ruleIds.filter((id): id is string => id !== null));
    if (used.size === 0) return;
    const limited = (await this.limitedPromotions(locationId, tx)).filter(
      (rule) => used.has(rule.id),
    );
    const usage = await this.usage(
      limited,
      clientId,
      visitStartAt,
      bookingId,
      orderId,
      tx,
    );
    for (const rule of limited) {
      const counted = usage[rule.id] ?? { total: 0, perClient: 0 };
      const reason =
        rule.usageLimitTotal !== null && counted.total >= rule.usageLimitTotal
          ? PriceRuleSkipReason.LIMIT_REACHED
          : rule.usageLimitPerClient !== null &&
              counted.perClient >= rule.usageLimitPerClient
            ? PriceRuleSkipReason.CLIENT_LIMIT_REACHED
            : null;
      if (reason === null) continue;
      const payload: PromotionNotApplicable = {
        lineIndex: -1,
        ruleId: rule.id,
        reason,
      };
      throw new AppException(
        ErrorCode.PROMOTION_NOT_APPLICABLE,
        HttpStatus.CONFLICT,
        payload,
      );
    }
  }

  /** undefined: the client is not known (no id, unknown phone gives a new client below). */
  private async findClient(
    request: PricingContextRequest,
  ): Promise<Client | null | undefined> {
    if (request.clientId) {
      const client = await this.clients.findForBooking(
        request.brandId,
        request.clientId,
      );
      if (!client)
        throw new AppException(
          ErrorCode.BOOKING_CLIENT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return client;
    }
    const phone = request.phone?.trim();
    if (!phone) return undefined;
    // A phone the brand does not know yet belongs to a new client.
    return this.clients.findByPhoneForBooking(request.brandId, phone);
  }

  /** The booking being edited must be a live booking of the location, else 404. */
  private async editedBooking(
    bookingId: string,
    locationId: string,
    db: Prisma.TransactionClient,
  ): Promise<EditedBooking> {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, locationId: true, createdAt: true, deletedAt: true },
    });
    if (
      !booking ||
      booking.deletedAt !== null ||
      booking.locationId !== locationId
    )
      throw new NotFoundException('Booking not found');
    return { id: booking.id, createdAt: booking.createdAt };
  }

  private async quoteClient(
    client: Client | null,
    edited: EditedBooking | null,
    request: PricingContextRequest,
    db: Prisma.TransactionClient,
  ): Promise<QuoteClient> {
    if (client === null)
      return {
        known: true,
        isNew: true,
        birthday: null,
        servicesDiscountBp: null,
        productsDiscountBp: null,
      };
    return {
      known: true,
      isNew:
        client.importedAt === null &&
        !(await this.hasBookings(client, edited, db)) &&
        !(request.sale === true && (await this.hasSales(client, request, db))),
      birthday: client.birthDate
        ? TimeUtils.dateOnlyStr(client.birthDate).slice(5)
        : null,
      servicesDiscountBp:
        client.servicesDiscountPercent === null
          ? null
          : MoneyUtils.toMinor(client.servicesDiscountPercent),
      productsDiscountBp:
        client.productsDiscountPercent === null
          ? null
          : MoneyUtils.toMinor(client.productsDiscountPercent),
    };
  }

  /** Live bookings of the client in any location of the brand, before the edited one. */
  private async hasBookings(
    client: Client,
    edited: EditedBooking | null,
    db: Prisma.TransactionClient,
  ): Promise<boolean> {
    const found = await db.booking.findFirst({
      where: {
        clientId: client.id,
        deletedAt: null,
        status: { not: BookingStatus.CANCELLED },
        ...(edited && {
          id: { not: edited.id },
          createdAt: { lt: edited.createdAt },
        }),
      },
      select: { id: true },
    });
    return found !== null;
  }

  /** Other active orders of the client with a confirmed product line (clients are per brand). */
  private async hasSales(
    client: Client,
    request: PricingContextRequest,
    db: Prisma.TransactionClient,
  ): Promise<boolean> {
    const found = await db.order.findFirst({
      where: {
        clientId: client.id,
        status: OrderStatus.ACTIVE,
        ...(request.orderId && { id: { not: request.orderId } }),
        items: {
          some: {
            type: OrderItemType.PRODUCT,
            status: OrderItemStatus.CONFIRMED,
          },
        },
      },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Live promotions of the location with a limit. In a transaction their rows are locked
   * (FOR UPDATE) until it ends, so two writes cannot both take the last use; `lock` false
   * reads them in the transaction without a lock.
   */
  private limitedPromotions(
    locationId: string,
    tx?: Prisma.TransactionClient,
    lock = true,
  ): Promise<PromotionLimitRow[]> {
    const forUpdate = tx && lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    return (tx ?? this.db).$queryRaw<PromotionLimitRow[]>`
      SELECT "id", "usageLimitTotal", "usageLimitPerClient", "usageLimitPeriod"
      FROM "PriceRule"
      WHERE "locationId" = ${locationId}
        AND "kind" = 'PROMOTION'
        AND "archivedAt" IS NULL
        AND ("usageLimitTotal" IS NOT NULL OR "usageLimitPerClient" IS NOT NULL)
      ORDER BY "id"
      ${forUpdate}`;
  }

  /**
   * Uses of each limited promotion in one query: all visits and sales, and those of this
   * client within the limit period around `at` (365/30/7 days before or after; all time).
   * A visit is one use however many of its items and product lines carry the promotion. The
   * own booking and order (and the order of that booking, the booking of that order) are
   * left out.
   */
  private async usage(
    rules: readonly PromotionLimitRow[],
    clientId: string | null,
    at: Date,
    bookingId: string | null,
    orderId: string | null,
    db: Prisma.TransactionClient,
  ): Promise<Record<string, PromotionUsage>> {
    if (rules.length === 0) return {};
    const ids = Prisma.join(rules.map((rule) => rule.id));
    const atSeconds = at.getTime() / 1000;
    const rows = await db.$queryRaw<PromotionUsageRow[]>`
      WITH uses AS (
        SELECT a."ruleId" AS "ruleId", 'B:' || b."id" AS "unit",
               b."clientId" AS "clientId", b."startAt" AS "at"
        FROM "BookingItemPriceAdjustment" a
        JOIN "BookingItem" i ON i."id" = a."bookingItemId"
        JOIN "Booking" b ON b."id" = i."bookingId"
        WHERE a."ruleId" IN (${ids})
          AND a."kind" = 'PROMOTION'
          AND b."deletedAt" IS NULL
          AND b."status" <> 'CANCELLED'
        UNION ALL
        SELECT a."ruleId",
               CASE WHEN o."bookingId" IS NULL THEN 'O:' || o."id" ELSE 'B:' || o."bookingId" END,
               COALESCE(b."clientId", o."clientId"),
               COALESCE(b."startAt", oi."confirmedAt", o."occurredAt")
        FROM "OrderItemPriceAdjustment" a
        JOIN "OrderItem" oi ON oi."id" = a."orderItemId"
        JOIN "Order" o ON o."id" = oi."orderId"
        LEFT JOIN "Booking" b ON b."id" = o."bookingId"
        WHERE a."ruleId" IN (${ids})
          AND a."kind" = 'PROMOTION'
          AND oi."type" = 'PRODUCT'
          AND oi."status" = 'CONFIRMED'
          AND o."status" = 'ACTIVE'
          AND (o."bookingId" IS NULL OR (b."deletedAt" IS NULL AND b."status" <> 'CANCELLED'))
      )
      SELECT u."ruleId" AS "ruleId",
             COUNT(DISTINCT u."unit")::int AS "total",
             (COUNT(DISTINCT u."unit") FILTER (
               WHERE u."clientId" = ${clientId ?? ''}
                 AND (
                   r."usageLimitPeriod" IS NULL
                   OR r."usageLimitPeriod" = 'ALL_TIME'
                   OR ABS(EXTRACT(EPOCH FROM u."at") - ${atSeconds}::double precision) <
                     (CASE r."usageLimitPeriod"
                       WHEN 'YEAR' THEN ${PERIOD_DAYS.YEAR}::int
                       WHEN 'MONTH' THEN ${PERIOD_DAYS.MONTH}::int
                       ELSE ${PERIOD_DAYS.WEEK}::int END) * ${SECONDS_PER_DAY}::int
                 )
             ))::int AS "perClient"
      FROM uses u
      JOIN "PriceRule" r ON r."id" = u."ruleId"
      WHERE u."unit" NOT IN (
        ${'B:' + (bookingId ?? '')},
        ${'O:' + (orderId ?? '')},
        COALESCE((SELECT 'B:' || "bookingId" FROM "Order" WHERE "id" = ${orderId ?? ''}), '')
      )
      GROUP BY u."ruleId"`;
    const byRule = new Map(rows.map((row) => [row.ruleId, row]));
    const usage: Record<string, PromotionUsage> = {};
    for (const rule of rules) {
      const row = byRule.get(rule.id);
      usage[rule.id] = {
        total: row?.total ?? 0,
        perClient: clientId === null ? 0 : (row?.perClient ?? 0),
      };
    }
    return usage;
  }
}
