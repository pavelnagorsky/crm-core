import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  OrderItemStatus,
  OrderItemType,
  OrderReturnStatus,
  OrderStatus,
  PriceAdjustmentKind,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { PRICE_RULE_STATS_DAYS } from '../constants/price-rule.constants.js';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';
import { PromotionFullReport } from '../interfaces/promotion-full-report.interface.js';
import { PromotionProductLine } from '../interfaces/promotion-product-line.interface.js';
import { PromotionProductStats } from '../interfaces/promotion-product-stats.interface.js';
import { PromotionReport } from '../interfaces/promotion-report.interface.js';
import { PromotionSaleLine } from '../interfaces/promotion-sale-line.interface.js';
import { PromotionSalesStats } from '../interfaces/promotion-sales-stats.interface.js';
import { PromotionStaffInfo } from '../interfaces/promotion-staff-info.interface.js';
import { PromotionUsageCountRow } from '../interfaces/promotion-usage-count-row.interface.js';
import {
  mergePromotionReport,
  promotionProductReport,
  promotionProductStats,
  promotionProductStatsByRule,
} from '../rules/promotion-product-report.rules.js';

const MS_PER_DAY = 86_400_000;
const ZERO = new Prisma.Decimal(0);

/**
 * What promotions did to product lines (docs/pricing-stage7-api.md, «Кабинет: акции»): the
 * product side of the list stats, the summary, the promotion page and the preview matches.
 * A line counts when it is a CONFIRMED product line of an ACTIVE order of the location with
 * a PROMOTION layer, by its confirmedAt; all posted returns of the line are deducted.
 */
@Injectable()
export class PromotionProductStatsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
  ) {}

  /**
   * Product lines of the last 30 days of each promotion (net of returns, separate sales) and
   * its uses of all time: live visits and separate sales, each once.
   */
  async ruleStats(
    locationId: string,
    ruleIds: readonly string[],
    now: Date,
  ): Promise<Map<string, PromotionSalesStats>> {
    if (ruleIds.length === 0) return new Map();
    const since = new Date(now.getTime() - PRICE_RULE_STATS_DAYS * MS_PER_DAY);
    const [lines, usage] = await Promise.all([
      this.lines(locationId, ruleIds, since, now),
      this.usageCounts(ruleIds),
    ]);
    const products = promotionProductStatsByRule(lines);
    return new Map(
      ruleIds.map((ruleId) => [
        ruleId,
        {
          ...(products.get(ruleId) ?? {
            revenue: ZERO,
            discount: ZERO,
            salesCount: 0,
          }),
          usageCount: usage.get(ruleId) ?? 0,
        },
      ]),
    );
  }

  /** Product lines with any promotion of the location confirmed in [from, to]. */
  async periodTotals(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<PromotionProductStats> {
    return promotionProductStats(await this.lines(locationId, null, from, to));
  }

  /**
   * The promotion page: the visit report of the bookings module with the product lines
   * confirmed since `since` (null: all time) up to now.
   */
  async fullReport(
    locationId: string,
    ruleId: string,
    since: Date | null,
    now: Date,
    visits: PromotionReport,
  ): Promise<PromotionFullReport> {
    const [lines, bookingClientIds] = await Promise.all([
      this.lines(locationId, [ruleId], since, now),
      this.bookingClientIds(locationId, ruleId, since, now),
    ]);
    const products = promotionProductReport(lines);
    const listed = new Set(visits.staff.map((row) => row.staffId));
    const staffInfo = products.sellers.some(
      (seller) => !listed.has(seller.staffId),
    )
      ? new Map(
          (await this.staff.listInLocation(locationId)).map((member) => [
            member.id,
            { name: member.name, avatarUrl: member.avatarFile?.url ?? null },
          ]),
        )
      : new Map<string, PromotionStaffInfo>();
    return mergePromotionReport(visits, products, bookingClientIds, staffInfo);
  }

  /** Confirmed product lines of separate sales confirmed in [from, to], for preview matches. */
  async saleLines(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<PromotionSaleLine[]> {
    const items = await this.db.orderItem.findMany({
      where: {
        type: OrderItemType.PRODUCT,
        status: OrderItemStatus.CONFIRMED,
        confirmedAt: { gte: from, lte: to },
        catalogItemId: { not: null },
        order: { locationId, status: OrderStatus.ACTIVE, bookingId: null },
      },
      select: {
        orderId: true,
        catalogItemId: true,
        categoryId: true,
        unit: true,
        quantity: true,
        listUnitPrice: true,
        sellerStaffId: true,
        confirmedAt: true,
      },
    });
    return items.map((item) => ({
      orderId: item.orderId,
      productId: item.catalogItemId as string,
      productCategoryId: item.categoryId,
      unit: (item.unit ?? ProductUnit.PIECE) as string as ProductUnit,
      quantity: item.quantity,
      listUnitPrice: item.listUnitPrice,
      sellerStaffId: item.sellerStaffId,
      confirmedAt: item.confirmedAt as Date,
    }));
  }

  /**
   * Lines with a PROMOTION layer of these rules (null: any promotion) confirmed in
   * [since, to] (since null: all time), with the posted returns of each line.
   */
  private async lines(
    locationId: string,
    ruleIds: readonly string[] | null,
    since: Date | null,
    to: Date,
  ): Promise<PromotionProductLine[]> {
    const layer: Prisma.OrderItemPriceAdjustmentWhereInput = {
      kind: PriceAdjustmentKind.PROMOTION,
      ...(ruleIds === null
        ? { ruleId: { not: null } }
        : { ruleId: { in: [...ruleIds] } }),
    };
    const items = await this.db.orderItem.findMany({
      where: {
        type: OrderItemType.PRODUCT,
        status: OrderItemStatus.CONFIRMED,
        confirmedAt: { ...(since && { gte: since }), lte: to },
        order: { locationId, status: OrderStatus.ACTIVE },
        priceAdjustments: { some: layer },
      },
      select: {
        id: true,
        orderId: true,
        catalogItemId: true,
        title: true,
        quantity: true,
        lineTotal: true,
        discountTotal: true,
        sellerStaffId: true,
        sellerName: true,
        order: {
          select: {
            bookingId: true,
            clientId: true,
            booking: { select: { clientId: true } },
          },
        },
        priceAdjustments: { where: layer, select: { ruleId: true } },
        returnItems: {
          where: { return: { status: OrderReturnStatus.POSTED } },
          select: { quantity: true, lineTotal: true, discountTotal: true },
        },
      },
    });
    return items.map((item) => ({
      orderItemId: item.id,
      orderId: item.orderId,
      ruleIds: item.priceAdjustments.flatMap((adjustment) =>
        adjustment.ruleId === null ? [] : [adjustment.ruleId],
      ),
      bookingId: item.order.bookingId,
      clientId: item.order.booking?.clientId ?? item.order.clientId,
      productId: item.catalogItemId,
      title: item.title,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      discountTotal: item.discountTotal,
      sellerStaffId: item.sellerStaffId,
      sellerName: item.sellerName,
      returnedQuantity: sum(item.returnItems.map((row) => row.quantity)),
      returnedTotal: sum(item.returnItems.map((row) => row.lineTotal)),
      returnedDiscount: sum(item.returnItems.map((row) => row.discountTotal)),
    }));
  }

  /**
   * Clients of the live bookings the promotion page counts (visit in the period, an item
   * with the promotion), to count distinct clients over bookings and sales.
   */
  private async bookingClientIds(
    locationId: string,
    ruleId: string,
    since: Date | null,
    now: Date,
  ): Promise<string[]> {
    const items = await this.db.bookingItem.findMany({
      where: {
        locationId,
        startAt: { ...(since && { gte: since }), lte: now },
        booking: {
          status: { not: BookingStatus.CANCELLED },
          deletedAt: null,
          clientId: { not: null },
        },
        priceAdjustments: {
          some: { kind: PriceAdjustmentKind.PROMOTION, ruleId },
        },
      },
      select: { booking: { select: { clientId: true } } },
    });
    return [
      ...new Set(
        items.flatMap((item) =>
          item.booking.clientId === null ? [] : [item.booking.clientId],
        ),
      ),
    ];
  }

  /**
   * Uses of each promotion of all time, by the stage 7 rule: a live booking with an item or
   * a confirmed product line of its order with the promotion is one use, a separate sale
   * with such a line is one use (the counter PricingContextService checks limits with).
   */
  private async usageCounts(
    ruleIds: readonly string[],
  ): Promise<Map<string, number>> {
    const ids = Prisma.join([...ruleIds]);
    const rows = await this.db.$queryRaw<PromotionUsageCountRow[]>`
      SELECT u."ruleId" AS "ruleId", COUNT(DISTINCT u."unit")::int AS "count"
      FROM (
        SELECT a."ruleId" AS "ruleId", 'B:' || b."id" AS "unit"
        FROM "BookingItemPriceAdjustment" a
        JOIN "BookingItem" i ON i."id" = a."bookingItemId"
        JOIN "Booking" b ON b."id" = i."bookingId"
        WHERE a."ruleId" IN (${ids})
          AND a."kind" = 'PROMOTION'
          AND b."deletedAt" IS NULL
          AND b."status" <> 'CANCELLED'
        UNION ALL
        SELECT a."ruleId",
               CASE WHEN o."bookingId" IS NULL THEN 'O:' || o."id" ELSE 'B:' || o."bookingId" END
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
      ) u
      GROUP BY u."ruleId"`;
    return new Map(rows.map((row) => [row.ruleId, row.count]));
  }
}

function sum(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}
