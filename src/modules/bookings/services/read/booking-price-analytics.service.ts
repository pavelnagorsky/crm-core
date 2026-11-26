import { Injectable } from '@nestjs/common';
import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { REVENUE_STATUSES } from '../../../dashboard/constants/dashboard-widget.constants.js';
import { PriceAnalyticsItemType } from '../../../pricing/enums/price-analytics-item-type.enum.js';
import { PriceAnalyticsSource } from '../../../pricing/enums/price-analytics-source.enum.js';
import { PriceChangeReason } from '../../../pricing/enums/price-change-reason.enum.js';
import { PriceAnalyticsItem } from '../../../pricing/interfaces/price-analytics-item.interface.js';
import { PriceAnalyticsQuery } from '../../../pricing/interfaces/price-analytics-query.interface.js';
import { priceItemBreakdown } from '../../../pricing/rules/price-analytics-item.rules.js';

const RULE_LAYERS = [
  PriceAdjustmentKind.SURCHARGE,
  PriceAdjustmentKind.PROMOTION,
  PriceAdjustmentKind.CLIENT_DISCOUNT,
];

/**
 * Booking services of the discounts and surcharges report (docs/pricing-stage8-api.md, «База
 * отчёта»): items of CONFIRMED and COMPLETED bookings of the location whose visit started in
 * the period and not later than now, split by their stored price layers. The price layers of
 * booking items are owned here.
 */
@Injectable()
export class BookingPriceAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async items(
    locationId: string,
    query: PriceAnalyticsQuery,
  ): Promise<PriceAnalyticsItem[]> {
    const where = candidatesWhere(locationId, query);
    if (where === null) return [];
    const rows = await this.db.bookingItem.findMany({
      where,
      select: {
        id: true,
        bookingId: true,
        staffId: true,
        staffName: true,
        serviceTitle: true,
        staffPrice: true,
        listPrice: true,
        chargedPrice: true,
        customPrice: true,
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
        booking: {
          select: {
            startAt: true,
            clientId: true,
            clientFirstName: true,
            clientLastName: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      ...priceItemBreakdown({
        regular: row.staffPrice,
        list: row.listPrice,
        received: row.customPrice ?? row.chargedPrice,
        custom: row.customPrice !== null,
        layers: row.priceAdjustments,
      }),
      id: row.id,
      itemType: PriceAnalyticsItemType.SERVICE,
      source: PriceAnalyticsSource.BOOKING,
      bookingId: row.bookingId,
      orderId: null,
      at: row.booking.startAt,
      title: row.serviceTitle,
      quantity: null,
      clientId: row.booking.clientId,
      clientName:
        row.booking.clientId === null
          ? null
          : [row.booking.clientFirstName, row.booking.clientLastName]
              .filter(Boolean)
              .join(' '),
      staffId: row.staffId,
      staffName: row.staffName,
      returned: false,
    }));
  }

  /**
   * Rows the pre-filter selects: the items the report may contain, before their reasons are
   * computed. Cheap, used to refuse a too large export before loading it.
   */
  async countCandidates(
    locationId: string,
    query: PriceAnalyticsQuery,
  ): Promise<number> {
    const where = candidatesWhere(locationId, query);
    return where === null ? 0 : this.db.bookingItem.count({ where });
  }
}

/** The SQL where of the loader; null when no item can match (every booking item has a staff member). */
function candidatesWhere(
  locationId: string,
  query: PriceAnalyticsQuery,
): Prisma.BookingItemWhereInput | null {
  if (query.staffId === null) return null;
  return {
    locationId,
    ...(query.staffId !== undefined && { staffId: query.staffId }),
    // locationId on the booking too: the (locationId, deletedAt, startAt) index of Booking.
    booking: {
      locationId,
      deletedAt: null,
      status: { in: REVENUE_STATUSES },
      startAt: { gte: query.from, lt: query.to, lte: query.now },
    },
    ...changedWhere(query),
  };
}

/**
 * SQL pre-filter of the items that can have the reasons asked for: a custom price or a rule
 * layer; {} when every item is wanted. The reasons are computed in memory afterwards.
 */
function changedWhere(query: PriceAnalyticsQuery): Prisma.BookingItemWhereInput {
  if (query.reason === undefined)
    return query.changedOnly
      ? {
          OR: [
            { customPrice: { not: null } },
            { priceAdjustments: { some: { kind: { in: RULE_LAYERS } } } },
          ],
        }
      : {};
  switch (query.reason) {
    case PriceChangeReason.CUSTOM_PRICE_DOWN:
    case PriceChangeReason.CUSTOM_PRICE_UP:
      return { customPrice: { not: null } };
    case PriceChangeReason.CLIENT_DISCOUNT:
      return {
        customPrice: null,
        priceAdjustments: { some: { kind: PriceAdjustmentKind.CLIENT_DISCOUNT } },
      };
    case PriceChangeReason.PROMOTION:
      return {
        customPrice: null,
        priceAdjustments: {
          some: {
            kind: PriceAdjustmentKind.PROMOTION,
            ...(query.ruleId !== undefined && { ruleId: query.ruleId }),
          },
        },
      };
    case PriceChangeReason.SURCHARGE:
      return {
        priceAdjustments: {
          some: {
            kind: PriceAdjustmentKind.SURCHARGE,
            ...(query.ruleId !== undefined && { ruleId: query.ruleId }),
          },
        },
      };
  }
}
