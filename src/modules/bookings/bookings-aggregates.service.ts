import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { SeriesGranularity } from '../dashboard/enums/series-granularity.enum.js';
import { AggregateRange } from './interfaces/aggregate-range.interface.js';
import { AggregateSeriesRange } from './interfaces/aggregate-series-range.interface.js';
import { AggregateSnapshot } from './interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from './interfaces/series-row.interface.js';
import { ServiceCount } from './interfaces/service-count.interface.js';
import { SourceCount } from './interfaces/source-count.interface.js';

@Injectable()
export class BookingsAggregatesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Returns count and revenue grouped by BookingStatus for the given range in a single query.
   * The caller filters/sums the relevant statuses; this avoids issuing separate count/revenue
   * queries per status.
   */
  async snapshot(range: AggregateRange): Promise<AggregateSnapshot> {
    const rows = await this.db.$queryRaw<Array<{ status: BookingStatus; count: bigint; revenue: string; duration: bigint }>>(
      Prisma.sql`
        SELECT "status" AS status,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(COALESCE("customPrice", "servicePrice")), 0)::text AS revenue,
               COALESCE(SUM("serviceDuration"), 0)::bigint AS duration
        FROM "Booking"
        WHERE ${this.whereClause(range)}
        GROUP BY "status"
      `,
    );
    const byStatus = new Map<BookingStatus, { count: number; revenue: number; duration: number }>();
    let totalCount = 0;
    let totalRevenue = 0;
    let totalDuration = 0;
    for (const r of rows) {
      const count = Number(r.count);
      const revenue = Number(r.revenue);
      const duration = Number(r.duration);
      byStatus.set(r.status, { count, revenue, duration });
      totalCount += count;
      totalRevenue += revenue;
      totalDuration += duration;
    }
    return { byStatus, totalCount, totalRevenue, totalDuration };
  }

  async countByService(range: AggregateRange, statuses?: BookingStatus[]): Promise<ServiceCount[]> {
    const rows = await this.db.$queryRaw<Array<{ serviceId: string; serviceTitle: string; count: bigint; revenue: string; duration: bigint }>>(
      Prisma.sql`
        SELECT "serviceId" AS "serviceId",
               MAX("serviceTitle") AS "serviceTitle",
               COUNT(*)::bigint AS count,
               COALESCE(SUM(COALESCE("customPrice", "servicePrice")), 0)::text AS revenue,
               COALESCE(SUM("serviceDuration"), 0)::bigint AS duration
        FROM "Booking"
        WHERE ${this.whereClause(range, statuses)}
        GROUP BY "serviceId"
      `,
    );
    return rows.map((r) => ({
      serviceId: r.serviceId,
      serviceTitle: r.serviceTitle,
      count: Number(r.count),
      revenue: Number(r.revenue),
      duration: Number(r.duration),
    }));
  }

  async countBySource(range: AggregateRange, statuses?: BookingStatus[]): Promise<SourceCount[]> {
    const grouped = await this.db.booking.groupBy({
      by: ['source'],
      where: this.buildWhere(range, statuses),
      _count: { _all: true },
    });
    return grouped.map((g) => ({ source: g.source, count: g._count._all }));
  }

  async series(range: AggregateSeriesRange, includeStatus: boolean): Promise<SeriesRow[]> {
    // pgTruncUnit returns a value from a closed set ('hour'|'day'|'week'|'month'), so
    // Prisma.raw is safe here and lets the planner reuse the query plan across granularities.
    const trunc = Prisma.raw(`'${this.pgTruncUnit(range.granularity)}'`);
    const filters = this.whereClause(range, range.statuses);
    // startAt is stored as naive `timestamp` in UTC. First AT TIME ZONE 'UTC' tags it as
    // timestamptz, second AT TIME ZONE tz converts to wall-clock in the business timezone
    // for date_trunc, then the outer AT TIME ZONE tz maps the local midnight back to UTC.
    const bucketExpr = Prisma.sql`(date_trunc(${trunc}, ("startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${range.timezone})) AT TIME ZONE ${range.timezone}`;

    if (includeStatus) {
      const rows = await this.db.$queryRaw<Array<{ bucket: Date; status: BookingStatus; count: bigint; revenue: string; duration: bigint }>>(
        Prisma.sql`
          SELECT ${bucketExpr} AS bucket,
                 "status" AS status,
                 COUNT(*)::bigint AS count,
                 COALESCE(SUM(COALESCE("customPrice", "servicePrice")), 0)::text AS revenue,
                 COALESCE(SUM("serviceDuration"), 0)::bigint AS duration
          FROM "Booking"
          WHERE ${filters}
          GROUP BY bucket, "status"
          ORDER BY bucket ASC
        `,
      );
      return rows.map((r) => ({
        bucket: r.bucket,
        status: r.status,
        count: Number(r.count),
        revenue: Number(r.revenue),
        duration: Number(r.duration),
      }));
    }

    const rows = await this.db.$queryRaw<Array<{ bucket: Date; count: bigint; revenue: string; duration: bigint }>>(
      Prisma.sql`
        SELECT ${bucketExpr} AS bucket,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(COALESCE("customPrice", "servicePrice")), 0)::text AS revenue,
               COALESCE(SUM("serviceDuration"), 0)::bigint AS duration
        FROM "Booking"
        WHERE ${filters}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );
    return rows.map((r) => ({
      bucket: r.bucket,
      status: null,
      count: Number(r.count),
      revenue: Number(r.revenue),
      duration: Number(r.duration),
    }));
  }

  private buildWhere(range: AggregateRange, statuses?: BookingStatus[]): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = {
      businessId: range.businessId,
      deletedAt: null,
      startAt: { gte: range.from, lt: range.to },
    };
    if (statuses && statuses.length > 0) where.status = { in: statuses };
    if (range.staffId) where.staffId = range.staffId;
    if (range.serviceId) where.serviceId = range.serviceId;
    if (range.serviceIds) where.serviceId = { in: range.serviceIds };
    if (range.categoryId) where.service = { categoryId: range.categoryId };
    return where;
  }

  private whereClause(range: AggregateRange, statuses?: BookingStatus[]): Prisma.Sql {
    // startAt is stored as naive `timestamp` in UTC. Cast the Date-typed bind params to
    // `timestamp` explicitly so the comparison stays on the indexed column and doesn't
    // depend on session TIMEZONE (Prisma binds Date as timestamptz).
    const parts: Prisma.Sql[] = [
      Prisma.sql`"businessId" = ${range.businessId}`,
      Prisma.sql`"deletedAt" IS NULL`,
      Prisma.sql`"startAt" >= ${range.from}::timestamptz AT TIME ZONE 'UTC'`,
      Prisma.sql`"startAt" <  ${range.to}::timestamptz AT TIME ZONE 'UTC'`,
    ];
    if (statuses && statuses.length > 0) {
      parts.push(Prisma.sql`"status"::text IN (${Prisma.join(statuses.map((s) => Prisma.sql`${s}`))})`);
    }
    if (range.staffId) parts.push(Prisma.sql`"staffId" = ${range.staffId}`);
    if (range.serviceId) parts.push(Prisma.sql`"serviceId" = ${range.serviceId}`);
    if (range.serviceIds) {
      if (range.serviceIds.length === 0) {
        // Empty in-list → force empty result set without letting Postgres see IN ().
        parts.push(Prisma.sql`FALSE`);
      } else {
        parts.push(Prisma.sql`"serviceId" IN (${Prisma.join(range.serviceIds.map((id) => Prisma.sql`${id}`))})`);
      }
    }
    if (range.categoryId) {
      parts.push(Prisma.sql`"serviceId" IN (SELECT "id" FROM "Service" WHERE "categoryId" = ${range.categoryId})`);
    }
    return Prisma.join(parts, ' AND ');
  }

  private pgTruncUnit(granularity: SeriesGranularity): string {
    switch (granularity) {
      case SeriesGranularity.HOUR: return 'hour';
      case SeriesGranularity.DAY: return 'day';
      case SeriesGranularity.WEEK: return 'week';
      case SeriesGranularity.MONTH: return 'month';
    }
  }
}
