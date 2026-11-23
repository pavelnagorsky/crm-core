import { Injectable } from '@nestjs/common';
import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { PRICE_RULE_STATS_DAYS } from '../../../pricing/constants/price-rule.constants.js';
import { PriceRuleSurchargeStats } from '../../../pricing/interfaces/price-rule-surcharge-stats.interface.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';

const MS_PER_DAY = 86_400_000;

/** What surcharge rules added to bookings: the price layers of booking items are owned here. */
@Injectable()
export class BookingPriceRuleStatsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Surcharge a rule added to the items whose visit started in the last 30 days: the sum of
   * the layers and the number of distinct bookings, cancelled and deleted bookings left out.
   * Rules without such layers are absent from the result.
   */
  async surchargeStats(
    locationId: string,
    ruleIds: readonly string[],
    now: Date,
  ): Promise<Map<string, PriceRuleSurchargeStats>> {
    const stats = new Map<string, PriceRuleSurchargeStats>();
    if (ruleIds.length === 0) return stats;
    const layers = await this.db.bookingItemPriceAdjustment.findMany({
      where: {
        kind: PriceAdjustmentKind.SURCHARGE,
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
        amount: true,
        bookingItem: { select: { bookingId: true } },
      },
    });
    const bookings = new Map<string, Set<string>>();
    for (const layer of layers) {
      if (layer.ruleId === null) continue;
      const seen = bookings.get(layer.ruleId) ?? new Set<string>();
      seen.add(layer.bookingItem.bookingId);
      bookings.set(layer.ruleId, seen);
      const current = stats.get(layer.ruleId);
      stats.set(layer.ruleId, {
        ruleId: layer.ruleId,
        amount: (current?.amount ?? new Prisma.Decimal(0)).plus(layer.amount),
        bookingsCount: seen.size,
      });
    }
    return stats;
  }
}
