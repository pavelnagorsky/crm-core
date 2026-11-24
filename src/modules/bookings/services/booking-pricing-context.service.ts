import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Client, PromotionLimitPeriod, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ClientsService } from '../../clients/services/clients.service.js';
import { PriceRuleSkipReason } from '../../pricing/engine/enums/price-rule-skip-reason.enum.js';
import { PromotionUsage } from '../../pricing/engine/interfaces/promotion-usage.interface.js';
import { QuoteClient } from '../../pricing/engine/interfaces/quote-client.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { PromotionNotApplicable } from '../../pricing/interfaces/promotion-not-applicable.interface.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingPricingContextRequest } from '../interfaces/booking-pricing-context-request.interface.js';
import { PromotionLimitRow } from '../interfaces/promotion-limit-row.interface.js';

const MS_PER_DAY = 86_400_000;
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
  discountBp: null,
};

/**
 * Booking facts the price engine needs for promotions and the client discount
 * (docs/pricing-stage4-api.md): the channel, the clock, the client and how often the limited
 * promotions were used. A use is a live (not cancelled, not deleted) booking with a PROMOTION
 * layer of the rule; limits count bookings, not items.
 */
@Injectable()
export class BookingPricingContextService {
  constructor(
    private readonly db: DatabaseService,
    private readonly clients: ClientsService,
  ) {}

  async build(request: BookingPricingContextRequest): Promise<QuoteContext> {
    const now = request.now ?? new Date();
    const db = request.tx ?? this.db;
    const edited = request.bookingId
      ? await this.editedBooking(request.bookingId, request.locationId, db)
      : null;
    const client = await this.findClient(request);
    const limited = await this.limitedPromotions(
      request.locationId,
      request.tx,
    );
    return {
      channel: request.channel,
      nowMs: now.getTime(),
      today: TimeUtils.zonedDateStr(now, request.timezone),
      visitStartMs: request.visitStartAt?.getTime() ?? null,
      client:
        client === undefined
          ? UNKNOWN_CLIENT
          : await this.quoteClient(client, edited, db),
      promoCode: request.promoCode?.trim() || null,
      usage: await this.usage(
        limited,
        client?.id ?? null,
        request.visitStartAt ?? now,
        edited?.id ?? null,
        db,
      ),
      ...(request.choice && { choice: request.choice }),
    };
  }

  /**
   * In the transaction that stores a booking: the limited promotions its items use still have
   * room once their rows are locked (a concurrent booking of the last use waits and then sees
   * it). Otherwise 409 PROMOTION_NOT_APPLICABLE with LIMIT_REACHED or CLIENT_LIMIT_REACHED.
   */
  async assertLimitsHeld(
    tx: Prisma.TransactionClient,
    locationId: string,
    ruleIds: readonly (string | null)[],
    clientId: string | null,
    visitStartAt: Date,
    bookingId: string | null = null,
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
    request: BookingPricingContextRequest,
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
    db: Prisma.TransactionClient,
  ): Promise<QuoteClient> {
    if (client === null)
      return { known: true, isNew: true, birthday: null, discountBp: null };
    return {
      known: true,
      isNew: client.importedAt === null && !(await this.hasBookings(client, edited, db)),
      birthday: client.birthDate
        ? TimeUtils.dateOnlyStr(client.birthDate).slice(5)
        : null,
      discountBp:
        client.discountPercent === null
          ? null
          : MoneyUtils.toMinor(client.discountPercent),
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

  /**
   * Live promotions of the location with a limit. In a transaction their rows are locked
   * (FOR UPDATE) until it ends, so two bookings cannot both take the last use.
   */
  private limitedPromotions(
    locationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PromotionLimitRow[]> {
    const lock = tx ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    return (tx ?? this.db).$queryRaw<PromotionLimitRow[]>`
      SELECT "id", "usageLimitTotal", "usageLimitPerClient", "usageLimitPeriod"
      FROM "PriceRule"
      WHERE "locationId" = ${locationId}
        AND "kind" = 'PROMOTION'
        AND "archivedAt" IS NULL
        AND ("usageLimitTotal" IS NOT NULL OR "usageLimitPerClient" IS NOT NULL)
      ORDER BY "id"
      ${lock}`;
  }

  /**
   * Uses of each limited promotion: all live bookings, and those of this client whose visit
   * is within the limit period of the visit (365/30/7 days before or after; all time).
   */
  private async usage(
    rules: readonly PromotionLimitRow[],
    clientId: string | null,
    visitStartAt: Date,
    bookingId: string | null,
    db: Prisma.TransactionClient,
  ): Promise<Record<string, PromotionUsage>> {
    if (rules.length === 0) return {};
    const ids = rules.map((rule) => rule.id);
    const [totals, clientUses] = await Promise.all([
      db.$queryRaw<{ ruleId: string; total: number }[]>`
        SELECT a."ruleId" AS "ruleId", COUNT(DISTINCT i."bookingId")::int AS "total"
        FROM "BookingItemPriceAdjustment" a
        JOIN "BookingItem" i ON i."id" = a."bookingItemId"
        JOIN "Booking" b ON b."id" = i."bookingId"
        WHERE a."ruleId" IN (${Prisma.join(ids)})
          AND a."kind" = 'PROMOTION'
          AND b."deletedAt" IS NULL
          AND b."status" <> 'CANCELLED'
          AND b."id" <> ${bookingId ?? ''}
        GROUP BY a."ruleId"`,
      clientId === null
        ? Promise.resolve([])
        : db.booking.findMany({
            where: {
              clientId,
              deletedAt: null,
              status: { not: BookingStatus.CANCELLED },
              ...(bookingId && { id: { not: bookingId } }),
              items: {
                some: {
                  priceAdjustments: {
                    some: { ruleId: { in: ids }, kind: 'PROMOTION' },
                  },
                },
              },
            },
            select: {
              startAt: true,
              items: {
                select: {
                  priceAdjustments: {
                    where: { ruleId: { in: ids }, kind: 'PROMOTION' },
                    select: { ruleId: true },
                  },
                },
              },
            },
          }),
    ]);
    const total = new Map(totals.map((row) => [row.ruleId, row.total]));
    const usage: Record<string, PromotionUsage> = {};
    for (const rule of rules) {
      const days =
        rule.usageLimitPeriod === null
          ? null
          : PERIOD_DAYS[rule.usageLimitPeriod];
      const perClient = clientUses.filter(
        (booking) =>
          booking.items.some((item) =>
            item.priceAdjustments.some(
              (adjustment) => adjustment.ruleId === rule.id,
            ),
          ) &&
          (days === null ||
            Math.abs(booking.startAt.getTime() - visitStartAt.getTime()) <
              days * MS_PER_DAY),
      ).length;
      usage[rule.id] = { total: total.get(rule.id) ?? 0, perClient };
    }
    return usage;
  }
}
