import { Injectable } from '@nestjs/common';
import { OrderItemType, OrderStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ClientRevenueBucket } from '../../../shared/interfaces/client-revenue-bucket.interface.js';
import { ClientRevenue } from '../../../shared/interfaces/client-revenue.interface.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { ClientSalesRange } from './interfaces/client-sales-range.interface.js';
import { ClientSalesSeriesRange } from './interfaces/client-sales-series-range.interface.js';
import { ProductSalesRange } from './interfaces/product-sales-range.interface.js';
import { ProductSalesSeriesRange } from './interfaces/product-sales-series-range.interface.js';
import { ProductSalesSeriesRow } from './interfaces/product-sales-series-row.interface.js';
import { ProductSalesSnapshot } from './interfaces/product-sales-snapshot.interface.js';
import { ProductSalesStaffRow } from './interfaces/product-sales-staff-row.interface.js';

@Injectable()
export class OrdersAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async productSalesSnapshot(
    range: ProductSalesRange,
  ): Promise<ProductSalesSnapshot> {
    const rows = await this.db.$queryRaw<
      Array<{
        revenue: string;
        standaloneOrderCount: bigint;
        linkedBookingIds: string[];
      }>
    >(
      Prisma.sql`
        SELECT
          COALESCE(SUM(item_totals.revenue), 0)::text AS revenue,
          COUNT(*) FILTER (WHERE o."bookingId" IS NULL)::bigint AS "standaloneOrderCount",
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT o."bookingId"), NULL) AS "linkedBookingIds"
        FROM "Order" o
        ${this.productItemTotalsJoin(range)}
        WHERE ${this.productSalesWhere(range)}
      `,
    );
    const row = rows[0];
    return {
      revenue: MoneyService.decimal(row?.revenue),
      standaloneOrderCount: Number(row?.standaloneOrderCount ?? 0),
      linkedBookingIds: row?.linkedBookingIds ?? [],
    };
  }

  async productSalesSeries(
    range: ProductSalesSeriesRange,
  ): Promise<ProductSalesSeriesRow[]> {
    const bucket = this.bucketExpr(
      range.granularity,
      range.timezone,
      'o."occurredAt"',
    );
    const rows = await this.db.$queryRaw<
      Array<{ bucket: Date; revenue: string }>
    >(
      Prisma.sql`
        SELECT ${bucket} AS bucket,
               COALESCE(SUM(item_totals.revenue), 0)::text AS revenue
        FROM "Order" o
        ${this.productItemTotalsJoin(range)}
        WHERE ${this.productSalesWhere(range)}
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
        WHERE ${this.baseOrderWhere(range.locationId, range.from, range.to)}
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

  async clientRevenue(range: ClientSalesRange): Promise<ClientRevenue[]> {
    if (range.locationIds.length === 0) return [];
    const rows = await this.db.$queryRaw<
      Array<{ clientId: string; revenue: string }>
    >(
      Prisma.sql`
        SELECT o."clientId" AS "clientId",
               COALESCE(SUM(item_totals.revenue), 0)::text AS revenue
        FROM "Order" o
        ${this.allProductItemTotalsJoin()}
        WHERE ${this.clientSalesWhere(range)}
        GROUP BY o."clientId"
      `,
    );
    return rows.map((row) => ({
      clientId: row.clientId,
      revenue: MoneyService.decimal(row.revenue),
    }));
  }

  async clientRevenueSeries(
    range: ClientSalesSeriesRange,
  ): Promise<ClientRevenueBucket[]> {
    if (range.locationIds.length === 0) return [];
    const bucket = this.bucketExpr(
      range.granularity,
      range.timezone,
      'o."occurredAt"',
    );
    const rows = await this.db.$queryRaw<
      Array<{ bucket: Date; clientId: string; revenue: string }>
    >(
      Prisma.sql`
        SELECT ${bucket} AS bucket,
               o."clientId" AS "clientId",
               COALESCE(SUM(item_totals.revenue), 0)::text AS revenue
        FROM "Order" o
        ${this.allProductItemTotalsJoin()}
        WHERE ${this.clientSalesWhere(range)}
        GROUP BY bucket, o."clientId"
        ORDER BY bucket ASC
      `,
    );
    return rows.map((row) => ({
      bucket: new Date(row.bucket),
      clientId: row.clientId,
      revenue: MoneyService.decimal(row.revenue),
    }));
  }

  private productSalesWhere(range: ProductSalesRange): Prisma.Sql {
    return Prisma.sql`
      ${this.baseOrderWhere(range.locationId, range.from, range.to)}
      AND EXISTS (
        SELECT 1
        FROM "OrderItem" scoped_item
        WHERE scoped_item."orderId" = o."id"
          AND scoped_item."type"::text = ${OrderItemType.PRODUCT}
          AND ${this.productItemScope(range, 'scoped_item')}
      )
    `;
  }

  private baseOrderWhere(locationId: string, from: Date, to: Date): Prisma.Sql {
    return Prisma.sql`
      o."locationId" = ${locationId}
      AND o."status"::text = ${OrderStatus.POSTED}
      AND o."occurredAt" >= ${from}::timestamptz AT TIME ZONE 'UTC'
      AND o."occurredAt" < ${to}::timestamptz AT TIME ZONE 'UTC'
    `;
  }

  private clientSalesWhere(range: ClientSalesRange): Prisma.Sql {
    return Prisma.sql`
      o."locationId" IN (${Prisma.join(range.locationIds.map((id) => Prisma.sql`${id}`))})
      AND o."status"::text = ${OrderStatus.POSTED}
      AND o."clientId" IS NOT NULL
      AND o."occurredAt" >= ${range.from}::timestamptz AT TIME ZONE 'UTC'
      AND o."occurredAt" < ${range.to}::timestamptz AT TIME ZONE 'UTC'
      AND EXISTS (
        SELECT 1 FROM "OrderItem" product_item
        WHERE product_item."orderId" = o."id"
          AND product_item."type"::text = ${OrderItemType.PRODUCT}
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

  private allProductItemTotalsJoin(): Prisma.Sql {
    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(i."lineTotal"), 0) AS revenue
        FROM "OrderItem" i
        WHERE i."orderId" = o."id"
          AND i."type"::text = ${OrderItemType.PRODUCT}
      ) item_totals ON TRUE
    `;
  }

  private productItemScope(
    range: ProductSalesRange,
    alias: 'i' | 'scoped_item',
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    const staff = Prisma.raw(`${alias}."sellerStaffId"`);
    const catalogItem = Prisma.raw(`${alias}."catalogItemId"`);
    const category = Prisma.raw(`${alias}."categoryId"`);
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
    column: 'o."occurredAt"',
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
