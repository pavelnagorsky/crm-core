import { Injectable } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderItemType,
  OrderReturnStatus,
  OrderStatus,
  PriceAdjustmentKind,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PriceAnalyticsItemType } from '../../pricing/enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsSource } from '../../pricing/enums/price-analytics-source.enum.js';
import { PriceChangeReason } from '../../pricing/enums/price-change-reason.enum.js';
import { PriceAnalyticsItem } from '../../pricing/interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsQuery } from '../../pricing/interfaces/price-analytics-query.interface.js';
import {
  afterReturns,
  priceItemBreakdown,
} from '../../pricing/rules/price-analytics-item.rules.js';

const ZERO = new Prisma.Decimal(0);
const DISCOUNT_LAYERS = [
  PriceAdjustmentKind.PROMOTION,
  PriceAdjustmentKind.CLIENT_DISCOUNT,
];

/**
 * Product lines of the discounts and surcharges report (docs/pricing-stage8-api.md, «База
 * отчёта»): CONFIRMED product lines of ACTIVE orders of the location confirmed in the period
 * (visit products and separate sales; not those of a deleted booking), split by their stored price layers and net of all
 * posted returns; fully returned lines are left out.
 */
@Injectable()
export class OrderPriceAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async items(
    locationId: string,
    query: PriceAnalyticsQuery,
  ): Promise<PriceAnalyticsItem[]> {
    const where = candidatesWhere(locationId, query);
    if (where === null) return [];
    const rows = await this.db.orderItem.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        title: true,
        quantity: true,
        listUnitPrice: true,
        customUnitPrice: true,
        lineTotal: true,
        sellerStaffId: true,
        sellerName: true,
        confirmedAt: true,
        priceAdjustments: {
          select: {
            sortOrder: true,
            kind: true,
            ruleId: true,
            title: true,
            valueType: true,
            value: true,
            amount: true,
          },
        },
        returnItems: {
          where: { return: { status: OrderReturnStatus.POSTED } },
          select: { quantity: true },
        },
        order: {
          select: {
            bookingId: true,
            clientId: true,
            clientName: true,
            booking: {
              select: {
                clientId: true,
                clientFirstName: true,
                clientLastName: true,
              },
            },
          },
        },
      },
    });
    const items: PriceAnalyticsItem[] = [];
    for (const row of rows) {
      const listLineTotal = MoneyUtils.quantize(
        row.quantity.mul(row.listUnitPrice),
      );
      const returnedQuantity = row.returnItems.reduce(
        (total, item) => total.plus(item.quantity),
        ZERO,
      );
      const breakdown = afterReturns(
        priceItemBreakdown({
          regular: listLineTotal,
          list: listLineTotal,
          received: row.lineTotal,
          custom: row.customUnitPrice !== null,
          layers: row.priceAdjustments,
        }),
        row.quantity,
        returnedQuantity,
      );
      if (breakdown === null) continue;
      const booking = row.order.booking;
      const clientId = booking?.clientId ?? row.order.clientId;
      items.push({
        ...breakdown,
        id: row.id,
        itemType: PriceAnalyticsItemType.PRODUCT,
        source:
          row.order.bookingId === null
            ? PriceAnalyticsSource.SALE
            : PriceAnalyticsSource.BOOKING,
        bookingId: row.order.bookingId,
        orderId: row.orderId,
        at: row.confirmedAt as Date,
        title: row.title,
        quantity: row.quantity,
        clientId,
        clientName:
          clientId === null
            ? null
            : booking
              ? [booking.clientFirstName, booking.clientLastName]
                  .filter(Boolean)
                  .join(' ')
              : (row.order.clientName ?? ''),
        staffId: row.sellerStaffId,
        staffName: row.sellerName,
        returned: returnedQuantity.gt(0),
      });
    }
    return items;
  }

  /**
   * Rows the pre-filter selects: the lines the report may contain, before returns and reasons
   * are computed. Cheap, used to refuse a too large export before loading it.
   */
  async countCandidates(
    locationId: string,
    query: PriceAnalyticsQuery,
  ): Promise<number> {
    const where = candidatesWhere(locationId, query);
    return where === null ? 0 : this.db.orderItem.count({ where });
  }
}

/** The SQL where of the loader; null when no line can match. */
function candidatesWhere(
  locationId: string,
  query: PriceAnalyticsQuery,
): Prisma.OrderItemWhereInput | null {
  const changed = changedWhere(query);
  if (changed === null) return null;
  return {
    type: OrderItemType.PRODUCT,
    status: OrderItemStatus.CONFIRMED,
    confirmedAt: { gte: query.from, lt: query.to },
    order: {
      locationId,
      status: OrderStatus.ACTIVE,
      // Products of a deleted booking are not counted, as in the promotion usage counts.
      OR: [{ bookingId: null }, { booking: { deletedAt: null } }],
    },
    ...(query.staffId !== undefined && { sellerStaffId: query.staffId }),
    ...changed,
  };
}

/**
 * SQL pre-filter of the lines that can have the reasons asked for: a custom price or a
 * discount layer; {} when every line is wanted, null when none can match (product lines have
 * no surcharges).
 */
function changedWhere(
  query: PriceAnalyticsQuery,
): Prisma.OrderItemWhereInput | null {
  if (query.reason === undefined)
    return query.changedOnly
      ? {
          OR: [
            { customUnitPrice: { not: null } },
            { priceAdjustments: { some: { kind: { in: DISCOUNT_LAYERS } } } },
          ],
        }
      : {};
  switch (query.reason) {
    case PriceChangeReason.CUSTOM_PRICE_DOWN:
    case PriceChangeReason.CUSTOM_PRICE_UP:
      return { customUnitPrice: { not: null } };
    case PriceChangeReason.CLIENT_DISCOUNT:
      return {
        customUnitPrice: null,
        priceAdjustments: { some: { kind: PriceAdjustmentKind.CLIENT_DISCOUNT } },
      };
    case PriceChangeReason.PROMOTION:
      return {
        customUnitPrice: null,
        priceAdjustments: {
          some: {
            kind: PriceAdjustmentKind.PROMOTION,
            ...(query.ruleId !== undefined && { ruleId: query.ruleId }),
          },
        },
      };
    case PriceChangeReason.SURCHARGE:
      return null;
  }
}
