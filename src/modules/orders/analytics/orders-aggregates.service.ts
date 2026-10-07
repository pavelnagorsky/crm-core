import { Injectable } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingsAggregatesService } from '../../bookings/bookings-aggregates.service.js';
import { AggregateRange } from '../../bookings/interfaces/aggregate-range.interface.js';
import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { ClientSalesRange } from './interfaces/client-sales-range.interface.js';
import { ClientSalesSeriesRange } from './interfaces/client-sales-series-range.interface.js';
import { OrderClientRevenueBucket } from './interfaces/order-client-revenue-bucket.interface.js';
import { OrderClientRevenueTotals } from './interfaces/order-client-revenue-totals.interface.js';
import { ProductSalesRange } from './interfaces/product-sales-range.interface.js';
import { ProductSalesSeriesRange } from './interfaces/product-sales-series-range.interface.js';
import { ProductSalesSeriesRow } from './interfaces/product-sales-series-row.interface.js';
import { ProductSalesSnapshot } from './interfaces/product-sales-snapshot.interface.js';
import { ProductSalesStaffRow } from './interfaces/product-sales-staff-row.interface.js';

@Injectable()
export class OrdersAggregatesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly bookingsAggregates: BookingsAggregatesService,
  ) {}

  async productSalesSnapshot(
    range: ProductSalesRange,
  ): Promise<ProductSalesSnapshot> {
    const completedBookingExists =
      this.bookingsAggregates.completedBookingExists(
        this.bookingRange(range),
        Prisma.sql`o."bookingId"`,
      );
    const rows = await this.db.$queryRaw<
      Array<{
        revenue: string;
        standaloneOrderCount: bigint;
        extraLinkedBookingCount: bigint;
      }>
    >(
      Prisma.sql`
        SELECT
          COALESCE(SUM(item_totals.revenue), 0)::text AS revenue,
          COUNT(*) FILTER (WHERE o."bookingId" IS NULL)::bigint AS "standaloneOrderCount",
          COUNT(DISTINCT o."bookingId") FILTER (
            WHERE o."bookingId" IS NOT NULL
              AND NOT (${completedBookingExists})
          )::bigint AS "extraLinkedBookingCount"
        FROM "Order" o
        ${this.productItemTotalsJoin(range)}
        WHERE ${this.productSalesWhere(range)}
      `,
    );
    const row = rows[0];
    return {
      revenue: MoneyService.decimal(row?.revenue),
      standaloneOrderCount: Number(row?.standaloneOrderCount ?? 0),
      extraLinkedBookingCount: Number(row?.extraLinkedBookingCount ?? 0),
    };
  }

  async productSalesSeries(
    range: ProductSalesSeriesRange,
  ): Promise<ProductSalesSeriesRow[]> {
    const bucket = this.bucketExpr(
      range.granularity,
      range.timezone,
      'i."occurredAt"',
    );
    const rows = await this.db.$queryRaw<
      Array<{ bucket: Date; revenue: string }>
    >(
      Prisma.sql`
        SELECT ${bucket} AS bucket,
               COALESCE(SUM(i."lineTotal"), 0)::text AS revenue
        FROM "Order" o
        JOIN "OrderItem" i ON i."orderId" = o."id"
        WHERE ${this.baseOrderWhere(range.locationId)}
          AND i."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(range, 'i')}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );
    return rows.map((row) => ({
      bucket: new Date(row.bucket),
      revenue: MoneyService.decimal(row.revenue),
    }));
  }

  async productSalesByStaff(
    range: ProductSalesRange,
  ): Promise<ProductSalesStaffRow[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        staffId: string;
        staffName: string;
        orderCount: bigint;
        revenue: string;
      }>
    >(
      Prisma.sql`
        SELECT i."sellerStaffId" AS "staffId",
               MAX(i."sellerName") AS "staffName",
               COUNT(DISTINCT o."id")::bigint AS "orderCount",
               COALESCE(SUM(i."lineTotal"), 0)::text AS revenue
        FROM "Order" o
        JOIN "OrderItem" i ON i."orderId" = o."id"
        WHERE ${this.baseOrderWhere(range.locationId)}
          AND i."type"::text = ${OrderItemType.PRODUCT}
          AND i."sellerStaffId" IS NOT NULL
          AND ${this.productItemScope(range, 'i')}
        GROUP BY i."sellerStaffId"
      `,
    );
    return rows.map((row) => ({
      staffId: row.staffId,
      staffName: row.staffName,
      orderCount: Number(row.orderCount),
      revenue: MoneyService.decimal(row.revenue),
    }));
  }

  async clientRevenue(
    range: ClientSalesRange,
  ): Promise<OrderClientRevenueTotals> {
    if (range.locationIds.length === 0) return emptyOrderClientRevenue();
    const bookingClientIds =
      this.bookingsAggregates.clientRevenueClientIdsSql(range);
    const rows = await this.db.$queryRaw<
      Array<{
        revenue: string;
        activeClients: bigint;
        sharedClients: bigint;
      }>
    >(
      Prisma.sql`
        SELECT COALESCE(SUM(item_totals.revenue), 0)::text AS revenue,
               COUNT(DISTINCT o."clientId")::bigint AS "activeClients",
               COUNT(DISTINCT o."clientId") FILTER (
                 WHERE o."clientId" IN (${bookingClientIds})
               )::bigint AS "sharedClients"
        FROM "Order" o
        ${this.allProductItemTotalsJoin(range)}
        WHERE ${this.clientSalesWhere(range)}
      `,
    );
    return mapOrderClientRevenue(rows[0]);
  }

  async clientRevenueSeries(
    range: ClientSalesSeriesRange,
  ): Promise<OrderClientRevenueBucket[]> {
    if (range.locationIds.length === 0) return [];
    const bookingClientsByBucket =
      this.bookingsAggregates.clientRevenueClientsByBucketSql(range);
    const bucket = this.bucketExpr(
      range.granularity,
      range.timezone,
      'i."occurredAt"',
    );
    const rows = await this.db.$queryRaw<
      Array<{
        bucket: Date;
        revenue: string;
        activeClients: bigint;
        sharedClients: bigint;
      }>
    >(
      Prisma.sql`
        WITH booking_clients AS (
          ${bookingClientsByBucket}
        )
        SELECT ${bucket} AS bucket,
               COALESCE(SUM(i."lineTotal"), 0)::text AS revenue,
               COUNT(DISTINCT o."clientId")::bigint AS "activeClients",
               COUNT(DISTINCT o."clientId") FILTER (
                 WHERE EXISTS (
                   SELECT 1
                   FROM booking_clients bc
                   WHERE bc."clientId" = o."clientId"
                     AND bc.bucket = ${bucket}
                 )
               )::bigint AS "sharedClients"
        FROM "Order" o
        JOIN "OrderItem" i ON i."orderId" = o."id"
        WHERE ${this.clientSalesWhere(range)}
          AND i."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(
            {
              from: range.from,
              to: range.to,
            },
            'i',
          )}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    );
    return rows.map((row) => ({
      bucket: new Date(row.bucket),
      revenue: MoneyService.decimal(row.revenue),
      activeClients: Number(row.activeClients),
      sharedClients: Number(row.sharedClients),
    }));
  }

  private bookingRange(range: ProductSalesRange): AggregateRange {
    return {
      locationId: range.locationId,
      from: range.from,
      to: range.to,
      staffId: range.staffId,
      catalogItemId: range.catalogItemId,
      categoryId: range.categoryId,
    };
  }

  private productSalesWhere(range: ProductSalesRange): Prisma.Sql {
    return Prisma.sql`
      ${this.baseOrderWhere(range.locationId)}
      AND EXISTS (
        SELECT 1
        FROM "OrderItem" scoped_item
        WHERE scoped_item."orderId" = o."id"
          AND scoped_item."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(range, 'scoped_item')}
      )
    `;
  }

  private baseOrderWhere(locationId: string): Prisma.Sql {
    return Prisma.sql`
      o."locationId" = ${locationId}
      AND o."status"::text = ${OrderStatus.ACTIVE}
    `;
  }

  private clientSalesWhere(range: ClientSalesRange): Prisma.Sql {
    return Prisma.sql`
      o."locationId" IN (${Prisma.join(range.locationIds.map((id) => Prisma.sql`${id}`))})
      AND o."status"::text = ${OrderStatus.ACTIVE}
      AND o."clientId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "OrderItem" product_item
        WHERE product_item."orderId" = o."id"
          AND product_item."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(
            {
              from: range.from,
              to: range.to,
            },
            'product_item',
          )}
      )
    `;
  }

  private productItemTotalsJoin(range: ProductSalesRange): Prisma.Sql {
    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(i."lineTotal"), 0) AS revenue
        FROM "OrderItem" i
        WHERE i."orderId" = o."id"
          AND i."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(range, 'i')}
      ) item_totals ON TRUE
    `;
  }

  private allProductItemTotalsJoin(range: ClientSalesRange): Prisma.Sql {
    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(i."lineTotal"), 0) AS revenue
        FROM "OrderItem" i
        WHERE i."orderId" = o."id"
          AND i."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(
            {
              from: range.from,
              to: range.to,
            },
            'i',
          )}
      ) item_totals ON TRUE
    `;
  }

  private productItemScope(
    range: Pick<ProductSalesRange, 'from' | 'to'> &
      Partial<
        Pick<ProductSalesRange, 'staffId' | 'catalogItemId' | 'categoryId'>
      >,
    alias: 'i' | 'scoped_item' | 'product_item',
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    const staff = Prisma.raw(`${alias}."sellerStaffId"`);
    const catalogItem = Prisma.raw(`${alias}."catalogItemId"`);
    const category = Prisma.raw(`${alias}."categoryId"`);
    const status = Prisma.raw(`${alias}."status"`);
    const occurredAt = Prisma.raw(`${alias}."occurredAt"`);
    parts.push(Prisma.sql`${status}::text = ${OrderItemStatus.CONFIRMED}`);
    parts.push(
      Prisma.sql`${occurredAt} >= ${range.from}::timestamptz AT TIME ZONE 'UTC'`,
    );
    parts.push(
      Prisma.sql`${occurredAt} < ${range.to}::timestamptz AT TIME ZONE 'UTC'`,
    );
    if (range.staffId) parts.push(Prisma.sql`${staff} = ${range.staffId}`);
    if (range.catalogItemId) {
      parts.push(Prisma.sql`${catalogItem} = ${range.catalogItemId}`);
    }
    if (range.categoryId) {
      parts.push(Prisma.sql`${category} = ${range.categoryId}`);
    }
    return parts.length > 0 ? Prisma.join(parts, ' AND ') : Prisma.sql`TRUE`;
  }

  private bucketExpr(
    granularity: SeriesGranularity,
    timezone: string,
    column: 'o."occurredAt"' | 'i."occurredAt"',
  ): Prisma.Sql {
    const unit = Prisma.raw(`'${this.pgTruncUnit(granularity)}'`);
    const source = Prisma.raw(column);
    return Prisma.sql`(date_trunc(${unit}, (${source} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})) AT TIME ZONE ${timezone}`;
  }

  private pgTruncUnit(granularity: SeriesGranularity): string {
    switch (granularity) {
      case SeriesGranularity.HOUR:
        return 'hour';
      case SeriesGranularity.DAY:
        return 'day';
      case SeriesGranularity.WEEK:
        return 'week';
      case SeriesGranularity.MONTH:
        return 'month';
      default: {
        const exhaustive: never = granularity;
        throw new Error(`Unhandled series granularity: ${exhaustive}`);
      }
    }
  }
}

function mapOrderClientRevenue(
  row:
    | { revenue: string; activeClients: bigint; sharedClients: bigint }
    | undefined,
): OrderClientRevenueTotals {
  if (!row) return emptyOrderClientRevenue();
  return {
    revenue: MoneyService.decimal(row.revenue),
    activeClients: Number(row.activeClients),
    sharedClients: Number(row.sharedClients),
  };
}

function emptyOrderClientRevenue(): OrderClientRevenueTotals {
  return {
    revenue: MoneyService.decimal(0),
    activeClients: 0,
    sharedClients: 0,
  };
}
