import { Injectable } from '@nestjs/common';
import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { PRICE_RULE_STATS_DAYS } from '../../../pricing/constants/price-rule.constants.js';
import { PriceRuleStats } from '../../../pricing/interfaces/price-rule-stats.interface.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';

const MS_PER_DAY = 86_400_000;
const ZERO = new Prisma.Decimal(0);

/**
 * What price rules did to bookings: the price layers of booking items are owned here.
 * Cancelled and deleted bookings never count.
 */
@Injectable()
export class BookingPriceRuleStatsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * What each rule did to the items whose visit started in the last 30 days: the sum of its
   * layers (a promotion's discount as a positive amount) and distinct bookings; for
   * promotions also what those items cost, the new clients they brought and the live
   * bookings with the promotion of all time. Rules without layers are absent from the result.
   */
  async ruleStats(
    locationId: string,
    ruleIds: readonly string[],
    now: Date,
  ): Promise<Map<string, PriceRuleStats>> {
    const stats = new Map<string, PriceRuleStats>();
    if (ruleIds.length === 0) return stats;
    const [layers, usage] = await Promise.all([
      this.db.bookingItemPriceAdjustment.findMany({
        where: {
          kind: {
            in: [PriceAdjustmentKind.SURCHARGE, PriceAdjustmentKind.PROMOTION],
          },
          ruleId: { in: [...ruleIds] },
          bookingItem: {
            locationId,
            startAt: {
              gte: new Date(now.getTime() - PRICE_RULE_STATS_DAYS * MS_PER_DAY),
              lte: now,
            },
            booking: {
              status: { not: BookingStatus.CANCELLED },
              deletedAt: null,
            },
          },
        },
        select: {
          ruleId: true,
          kind: true,
          amount: true,
          bookingItem: {
            select: {
              id: true,
              bookingId: true,
              chargedPrice: true,
              customPrice: true,
              booking: { select: { acquiredClient: { select: { id: true } } } },
            },
          },
        },
      }),
      this.usageCounts(locationId, ruleIds),
    ]);
    const bookings = new Map<string, Set<string>>();
    const items = new Map<string, Set<string>>();
    const newClients = new Map<string, Set<string>>();
    const statsOf = (ruleId: string): PriceRuleStats => {
      let current = stats.get(ruleId);
      if (!current) {
        current = {
          ruleId,
          amount: ZERO,
          bookingsCount: 0,
          revenue: ZERO,
          newClients: 0,
          usageCount: usage.get(ruleId) ?? 0,
        };
        stats.set(ruleId, current);
      }
      return current;
    };
    for (const layer of layers) {
      if (layer.ruleId === null) continue;
      const ruleId = layer.ruleId;
      const item = layer.bookingItem;
      const promotion = layer.kind === PriceAdjustmentKind.PROMOTION;
      const current = statsOf(ruleId);
      const seen = bookings.get(ruleId) ?? new Set<string>();
      seen.add(item.bookingId);
      bookings.set(ruleId, seen);
      current.bookingsCount = seen.size;
      current.amount = current.amount.plus(
        promotion ? layer.amount.negated() : layer.amount,
      );
      if (!promotion) continue;
      const counted = items.get(ruleId) ?? new Set<string>();
      if (!counted.has(item.id)) {
        counted.add(item.id);
        items.set(ruleId, counted);
        current.revenue = current.revenue.plus(
          item.customPrice ?? item.chargedPrice,
        );
      }
      const acquired = item.booking.acquiredClient?.id;
      if (acquired) {
        const clients = newClients.get(ruleId) ?? new Set<string>();
        clients.add(acquired);
        newClients.set(ruleId, clients);
        current.newClients = clients.size;
      }
    }
    for (const ruleId of usage.keys()) statsOf(ruleId);
    return stats;
  }

  /** Live bookings of all time with a PROMOTION layer of each rule; rules without any are absent. */
  async usageCounts(
    locationId: string,
    ruleIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (ruleIds.length === 0) return new Map();
    const rows = await this.db.$queryRaw<{ ruleId: string; count: number }[]>`
      SELECT a."ruleId" AS "ruleId", COUNT(DISTINCT i."bookingId")::int AS count
      FROM "BookingItemPriceAdjustment" a
      JOIN "BookingItem" i ON i.id = a."bookingItemId"
      JOIN "Booking" b ON b.id = i."bookingId"
      WHERE a."kind"::text = 'PROMOTION'
        AND a."ruleId" = ANY(${[...ruleIds]}::text[])
        AND i."locationId" = ${locationId}
        AND b.status::text <> 'CANCELLED'
        AND b."deletedAt" IS NULL
      GROUP BY a."ruleId"`;
    return new Map(rows.map((row) => [row.ruleId, Number(row.count)]));
  }
}
