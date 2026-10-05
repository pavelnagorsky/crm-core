import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { SeriesGranularity } from '../dashboard/enums/series-granularity.enum.js';
import {
  CLIENT_RECENCY_BOUNDS,
  isClientRecencyBucket,
  recencyCutoff,
} from './client-recency.rules.js';
import {
  catalogCategoryMatch,
  catalogItemMatch,
} from './catalog-item-filter.js';
import { AggregateRange } from './interfaces/aggregate-range.interface.js';
import { AggregateSeriesRange } from './interfaces/aggregate-series-range.interface.js';
import { AggregateSnapshot } from './interfaces/aggregate-snapshot.interface.js';
import { ClientCohortBucket } from './interfaces/client-cohort-bucket.interface.js';
import { ClientCohortRange } from './interfaces/client-cohort-range.interface.js';
import { ClientCohortSeriesRange } from './interfaces/client-cohort-series-range.interface.js';
import { ClientCohortSummary } from './interfaces/client-cohort-summary.interface.js';
import { ClientRecencyBound } from './interfaces/client-recency-bound.interface.js';
import { ClientRecencyRow } from './interfaces/client-recency-row.interface.js';
import { HeatmapCell } from './interfaces/heatmap-cell.interface.js';
import { OccupancyBookedHours } from './interfaces/occupancy-booked-hours.interface.js';
import { SeriesRow } from './interfaces/series-row.interface.js';
import { ServiceCount } from './interfaces/service-count.interface.js';
import { SourceCount } from './interfaces/source-count.interface.js';
import { StaffCount } from './interfaces/staff-count.interface.js';

@Injectable()
export class BookingsAggregatesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Returns count and revenue grouped by BookingStatus for the given range in a single query.
   * The caller filters/sums the relevant statuses; this avoids issuing separate count/revenue
   * queries per status.
   */
  async snapshot(range: AggregateRange): Promise<AggregateSnapshot> {
    const rows = await this.db.$queryRaw<
      Array<{
        status: BookingStatus;
        count: bigint;
        revenue: string;
        duration: bigint;
      }>
    >(
      Prisma.sql`
        SELECT b."status" AS status,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(item_totals.revenue), 0)::text AS revenue,
               COALESCE(SUM(item_totals.duration), 0)::bigint AS duration
        FROM "Booking" b
        ${this.itemTotalsJoin(range)}
        WHERE ${this.whereClause(range)}
        GROUP BY b."status"
      `,
    );
    const byStatus = new Map<
      BookingStatus,
      { count: number; revenue: Prisma.Decimal; duration: number }
    >();
    let totalCount = 0;
    let totalRevenue = MoneyService.decimal(0);
    let totalDuration = 0;
    for (const r of rows) {
      const count = Number(r.count);
      const revenue = MoneyService.decimal(r.revenue);
      const duration = Number(r.duration);
      byStatus.set(r.status, { count, revenue, duration });
      totalCount += count;
      totalRevenue = totalRevenue.plus(revenue);
      totalDuration += duration;
    }
    return { byStatus, totalCount, totalRevenue, totalDuration };
  }

  async countByService(
    range: AggregateRange,
    statuses?: BookingStatus[],
  ): Promise<ServiceCount[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        serviceId: string;
        serviceTitle: string;
        count: bigint;
        revenue: string;
        duration: bigint;
      }>
    >(
      Prisma.sql`
        SELECT bi."serviceId" AS "serviceId",
               MAX(bi."serviceTitle") AS "serviceTitle",
               COUNT(*)::bigint AS count,
               COALESCE(SUM(COALESCE(bi."customPrice", bi."chargedPrice")), 0)::text AS revenue,
               COALESCE(SUM(bi."serviceDuration"), 0)::bigint AS duration
        FROM "Booking" b
        JOIN "BookingItem" bi ON bi."bookingId" = b."id"
        WHERE ${this.whereClause(range, statuses)}
          AND ${this.itemScopeClause(range, 'bi')}
        GROUP BY bi."serviceId"
      `,
    );
    return rows.map((r) => ({
      serviceId: r.serviceId,
      serviceTitle: r.serviceTitle,
      count: Number(r.count),
      revenue: MoneyService.decimal(r.revenue),
      duration: Number(r.duration),
    }));
  }

  async countBySource(
    range: AggregateRange,
    statuses?: BookingStatus[],
  ): Promise<SourceCount[]> {
    const grouped = await this.db.booking.groupBy({
      by: ['source'],
      where: this.buildWhere(range, statuses),
      _count: { _all: true },
    });
    return grouped.map((g) => ({ source: g.source, count: g._count._all }));
  }

  /**
   * Counts bookings grouped by ISO weekday (1=Mon..7=Sun) and hour of day (0..23) in the
   * business timezone. Zero-cell rows are omitted; callers fill the full 7x24 grid themselves.
   */
  async heatmapByWeekdayHour(
    range: AggregateRange,
    timezone: string,
  ): Promise<HeatmapCell[]> {
    const localExpr = Prisma.sql`((b."startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`;
    const rows = await this.db.$queryRaw<
      Array<{ weekday: number; hour: number; count: bigint }>
    >(
      Prisma.sql`
        SELECT EXTRACT(ISODOW FROM ${localExpr})::int AS weekday,
               EXTRACT(HOUR FROM ${localExpr})::int AS hour,
               COUNT(*)::bigint AS count
        FROM "Booking" b
        WHERE ${this.whereClause(range)}
        GROUP BY weekday, hour
      `,
    );
    return rows.map((r) => ({
      weekday: Number(r.weekday),
      hour: Number(r.hour),
      count: Number(r.count),
    }));
  }

  /**
   * Bookings grouped by staff with count, revenue and the denormalized display name from the
   * booking item. That reflects the staff name at the time of the booking, which is what an
   * analytics widget should show for a historical period.
   */
  async countByStaff(
    range: AggregateRange,
    statuses?: BookingStatus[],
  ): Promise<StaffCount[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        staffId: string;
        staffName: string;
        count: bigint;
        revenue: string;
      }>
    >(
      Prisma.sql`
        SELECT bi."staffId" AS "staffId",
               MAX(bi."staffName") AS "staffName",
               COUNT(*)::bigint AS count,
               COALESCE(SUM(COALESCE(bi."customPrice", bi."chargedPrice")), 0)::text AS revenue
        FROM "Booking" b
        JOIN "BookingItem" bi ON bi."bookingId" = b."id"
        WHERE ${this.whereClause(range, statuses)}
          AND ${this.itemScopeClause(range, 'bi')}
        GROUP BY bi."staffId"
      `,
    );
    return rows.map((r) => ({
      staffId: r.staffId,
      staffName: r.staffName,
      count: Number(r.count),
      revenue: MoneyService.decimal(r.revenue),
    }));
  }

  async series(
    range: AggregateSeriesRange,
    includeStatus: boolean,
  ): Promise<SeriesRow[]> {
    const filters = this.whereClause(range, range.statuses);
    const bucketExpr = this.bucketExpr(range.granularity, range.timezone);

    if (includeStatus) {
      const rows = await this.db.$queryRaw<
        Array<{
          bucket: Date;
          status: BookingStatus;
          count: bigint;
          revenue: string;
          duration: bigint;
        }>
      >(
        Prisma.sql`
          SELECT ${bucketExpr} AS bucket,
                 b."status" AS status,
                 COUNT(*)::bigint AS count,
                 COALESCE(SUM(item_totals.revenue), 0)::text AS revenue,
                 COALESCE(SUM(item_totals.duration), 0)::bigint AS duration
          FROM "Booking" b
          ${this.itemTotalsJoin(range)}
          WHERE ${filters}
          GROUP BY bucket, b."status"
          ORDER BY bucket ASC
        `,
      );
      return rows.map((r) => ({
        bucket: r.bucket,
        status: r.status,
        count: Number(r.count),
        revenue: MoneyService.decimal(r.revenue),
        duration: Number(r.duration),
      }));
    }

    const rows = await this.db.$queryRaw<
      Array<{ bucket: Date; count: bigint; revenue: string; duration: bigint }>
    >(
      Prisma.sql`
        SELECT ${bucketExpr} AS bucket,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(item_totals.revenue), 0)::text AS revenue,
               COALESCE(SUM(item_totals.duration), 0)::bigint AS duration
        FROM "Booking" b
        ${this.itemTotalsJoin(range)}
        WHERE ${filters}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );
    return rows.map((r) => ({
      bucket: r.bucket,
      status: null,
      count: Number(r.count),
      revenue: MoneyService.decimal(r.revenue),
      duration: Number(r.duration),
    }));
  }

  /**
   * Completed-visit cohort for [from, to). A visit is "new" when it is the client's
   * first completed visit ever; later completed visits are "returning". Rank is computed
   * from history before `to`, then the window is applied — filtering the window first
   * would mark every client's first in-range visit as new.
   */
  async clientCohortSummary(
    range: ClientCohortRange,
  ): Promise<ClientCohortSummary> {
    const rows = await this.db.$queryRaw<
      Array<{
        newVisits: bigint;
        returningVisits: bigint;
        activeClients: bigint;
        revenue: string;
      }>
    >(
      Prisma.sql`
        ${this.completedVisitsCte(range.businessId, range.to)}
        SELECT ${this.cohortAggregates()}
        FROM visits
        WHERE "startAt" >= ${range.from}::timestamptz AT TIME ZONE 'UTC'
      `,
    );
    return mapCohortSummary(rows[0]);
  }

  async clientCohortSeries(
    range: ClientCohortSeriesRange,
  ): Promise<ClientCohortBucket[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        bucket: Date;
        newVisits: bigint;
        returningVisits: bigint;
        activeClients: bigint;
        revenue: string;
      }>
    >(
      Prisma.sql`
        ${this.completedVisitsCte(range.businessId, range.to)}
        SELECT
          ${this.bucketExpr(range.granularity, range.timezone, 'v')} AS bucket,
          ${this.cohortAggregates()}
        FROM visits v
        WHERE v."startAt" >= ${range.from}::timestamptz AT TIME ZONE 'UTC'
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );
    return rows.map((row) => ({
      bucket: new Date(row.bucket),
      newVisits: Number(row.newVisits),
      returningVisits: Number(row.returningVisits),
      activeClients: Number(row.activeClients),
      revenue: MoneyService.decimal(row.revenue),
    }));
  }

  /**
   * Clients grouped by how many calendar days passed between their last completed
   * visit and `asOf`. Comparisons match `matchesRecencyBound`.
   */
  async clientRecency(
    businessId: string,
    asOf: Date,
    timezone: string,
  ): Promise<ClientRecencyRow[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        bucket: string;
        clients: bigint;
        visits: bigint;
        revenue: string;
      }>
    >(
      Prisma.sql`
        WITH last_visits AS (
          SELECT
            MAX(b."startAt") AS "lastVisit",
            COUNT(*)::bigint AS visits,
            COALESCE(SUM(item_totals.revenue), 0) AS revenue
          FROM "Booking" b
          ${this.itemTotalsJoin({ businessId, from: new Date(0), to: asOf })}
          WHERE b."businessId" = ${businessId}
            AND b."deletedAt" IS NULL
            AND b."status"::text = ${BookingStatus.COMPLETED}
            AND b."startAt" < ${asOf}::timestamptz AT TIME ZONE 'UTC'
          GROUP BY b."clientId"
        )
        SELECT
          bucket,
          COUNT(*)::bigint AS clients,
          COALESCE(SUM(visits), 0)::bigint AS visits,
          COALESCE(SUM(revenue), 0)::text AS revenue
        FROM (
          SELECT
            visits,
            revenue,
            CASE
              ${this.recencyCase(asOf, timezone)}
              ELSE NULL
            END AS bucket
          FROM last_visits
        ) tagged
        WHERE bucket IS NOT NULL
        GROUP BY bucket
      `,
    );
    return rows.flatMap((row) => {
      if (!isClientRecencyBucket(row.bucket)) return [];
      return [
        {
          bucket: row.bucket,
          clients: Number(row.clients),
          visits: Number(row.visits),
          revenue: MoneyService.decimal(row.revenue),
        },
      ];
    });
  }

  /**
   * Lost money in [from, to): the sum of prices on cancelled and no-show bookings.
   * Uses customPrice when set, else chargedPrice.
   */
  async lostRevenue(range: AggregateRange): Promise<Prisma.Decimal> {
    const statuses = [BookingStatus.CANCELLED, BookingStatus.NO_SHOW];
    const rows = await this.db.$queryRaw<Array<{ total: string }>>(
      Prisma.sql`
        SELECT COALESCE(SUM(item_totals.revenue), 0)::text AS total
        FROM "Booking" b
        ${this.itemTotalsJoin(range)}
        WHERE ${this.whereClause(range, statuses)}
      `,
    );
    return MoneyService.decimal(rows[0]?.total);
  }

  /**
   * Booked minutes for the occupancy numerator, split at `now`. Past held = bookings that already
   * happened and were not cancelled/no-show; future = confirmed bookings still to come. Cancelled
   * and no-show visits are excluded from both — an empty chair does not count as occupied.
   */
  async occupancyBookedMinutes(
    range: AggregateRange,
    now: Date,
  ): Promise<OccupancyBookedHours> {
    const heldPast = [
      BookingStatus.COMPLETED,
      BookingStatus.CONFIRMED,
      BookingStatus.PENDING,
    ];
    const rows = await this.db.$queryRaw<
      Array<{ pastHeld: bigint; futureConfirmed: bigint }>
    >(
      Prisma.sql`
        SELECT
          COALESCE(SUM(bi."serviceDuration") FILTER (
            WHERE b."startAt" < ${now}::timestamptz AT TIME ZONE 'UTC'
              AND b."status"::text IN (${Prisma.join(heldPast.map((s) => Prisma.sql`${s}`))})
          ), 0)::bigint AS "pastHeld",
          COALESCE(SUM(bi."serviceDuration") FILTER (
            WHERE b."startAt" >= ${now}::timestamptz AT TIME ZONE 'UTC'
              AND b."status"::text = ${BookingStatus.CONFIRMED}
          ), 0)::bigint AS "futureConfirmed"
        FROM "Booking" b
        JOIN "BookingItem" bi ON bi."bookingId" = b."id"
        WHERE ${this.whereClause(range)}
          AND ${this.itemScopeClause(range, 'bi')}
      `,
    );
    return {
      pastHeldMinutes: Number(rows[0]?.pastHeld ?? 0),
      futureConfirmedMinutes: Number(rows[0]?.futureConfirmed ?? 0),
    };
  }

  private buildWhere(
    range: AggregateRange,
    statuses?: BookingStatus[],
  ): Prisma.BookingWhereInput {
    const where: Prisma.BookingWhereInput = {
      businessId: range.businessId,
      deletedAt: null,
      startAt: { gte: range.from, lt: range.to },
    };
    if (statuses && statuses.length > 0) where.status = { in: statuses };
    const and: Prisma.BookingWhereInput[] = [];
    if (range.staffId)
      and.push({ items: { some: { staffId: range.staffId } } });
    if (range.catalogItemId) and.push(catalogItemMatch([range.catalogItemId]));
    // serviceIds is the services-analytics filter: work performed, including inside a bundle.
    if (range.serviceIds) and.push(this.performedServices(range.serviceIds));
    if (range.categoryId) and.push(catalogCategoryMatch(range.categoryId));
    if (and.length) where.AND = and;
    return where;
  }

  private whereClause(
    range: AggregateRange,
    statuses?: BookingStatus[],
  ): Prisma.Sql {
    // startAt is stored as naive `timestamp` in UTC. Cast the Date-typed bind params to
    // `timestamp` explicitly so the comparison stays on the indexed column and doesn't
    // depend on session TIMEZONE (Prisma binds Date as timestamptz).
    const parts: Prisma.Sql[] = [
      Prisma.sql`b."businessId" = ${range.businessId}`,
      Prisma.sql`b."deletedAt" IS NULL`,
      Prisma.sql`b."startAt" >= ${range.from}::timestamptz AT TIME ZONE 'UTC'`,
      Prisma.sql`b."startAt" <  ${range.to}::timestamptz AT TIME ZONE 'UTC'`,
    ];
    if (statuses && statuses.length > 0) {
      parts.push(
        Prisma.sql`b."status"::text IN (${Prisma.join(statuses.map((s) => Prisma.sql`${s}`))})`,
      );
    }
    if (range.staffId) {
      parts.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "BookingItem" bi
        WHERE bi."bookingId" = b."id" AND bi."staffId" = ${range.staffId}
      )`);
    }
    if (range.catalogItemId)
      parts.push(this.catalogItemSql(range.catalogItemId));
    if (range.serviceIds)
      parts.push(this.performedServicesSql(range.serviceIds));
    if (range.categoryId) parts.push(this.catalogCategorySql(range.categoryId));
    return Prisma.join(parts, ' AND ');
  }

  private performedServices(ids: string[]): Prisma.BookingWhereInput {
    if (ids.length === 0) return { id: { in: [] } };
    return { items: { some: { serviceId: { in: ids } } } };
  }

  private performedServicesSql(ids: string[]): Prisma.Sql {
    if (ids.length === 0) return Prisma.sql`FALSE`;
    return Prisma.sql`EXISTS (
      SELECT 1 FROM "BookingItem" bi
      WHERE bi."bookingId" = b."id"
        AND bi."serviceId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
    )`;
  }

  private catalogItemSql(id: string): Prisma.Sql {
    return Prisma.sql`(
      (b."bundleId" IS NULL AND EXISTS (
        SELECT 1 FROM "BookingItem" bi
        WHERE bi."bookingId" = b."id" AND bi."serviceId" = ${id}
      ))
      OR b."bundleId" = ${id}
    )`;
  }

  private catalogCategorySql(categoryId: string): Prisma.Sql {
    return Prisma.sql`(
      (b."bundleId" IS NULL AND EXISTS (
        SELECT 1 FROM "BookingItem" bi
        JOIN "Service" s ON s."id" = bi."serviceId"
        WHERE bi."bookingId" = b."id" AND s."categoryId" = ${categoryId}
      ))
      OR b."bundleId" IN (SELECT "id" FROM "ServiceBundle" WHERE "categoryId" = ${categoryId})
    )`;
  }

  private itemTotalsJoin(range: AggregateRange): Prisma.Sql {
    return Prisma.sql`
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(COALESCE(i."customPrice", i."chargedPrice")), 0) AS revenue,
          COALESCE(SUM(i."serviceDuration"), 0)::bigint AS duration
        FROM "BookingItem" i
        WHERE i."bookingId" = b."id"
          AND ${this.itemScopeClause(range, 'i')}
      ) item_totals ON TRUE
    `;
  }

  private itemScopeClause(
    range: AggregateRange,
    itemAlias: 'i' | 'bi',
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    const staffIdColumn = Prisma.raw(`${itemAlias}."staffId"`);
    const serviceIdColumn = Prisma.raw(`${itemAlias}."serviceId"`);

    if (range.staffId)
      parts.push(Prisma.sql`${staffIdColumn} = ${range.staffId}`);
    if (range.serviceIds) {
      if (range.serviceIds.length === 0) return Prisma.sql`FALSE`;
      parts.push(
        Prisma.sql`${serviceIdColumn} IN (${Prisma.join(range.serviceIds.map((id) => Prisma.sql`${id}`))})`,
      );
    }
    if (range.catalogItemId) {
      parts.push(Prisma.sql`(
        b."bundleId" = ${range.catalogItemId}
        OR (b."bundleId" IS NULL AND ${serviceIdColumn} = ${range.catalogItemId})
      )`);
    }
    if (range.categoryId) {
      parts.push(Prisma.sql`(
        b."bundleId" IN (SELECT "id" FROM "ServiceBundle" WHERE "categoryId" = ${range.categoryId})
        OR (
          b."bundleId" IS NULL
          AND ${serviceIdColumn} IN (SELECT "id" FROM "Service" WHERE "categoryId" = ${range.categoryId})
        )
      )`);
    }

    return parts.length > 0 ? Prisma.join(parts, ' AND ') : Prisma.sql`TRUE`;
  }

  private cohortAggregates(): Prisma.Sql {
    return Prisma.sql`
      COUNT(*) FILTER (WHERE visit_rank = 1)::bigint AS "newVisits",
      COUNT(*) FILTER (WHERE visit_rank > 1)::bigint AS "returningVisits",
      COUNT(DISTINCT "clientId")::bigint AS "activeClients",
      COALESCE(SUM(revenue), 0)::text AS revenue
    `;
  }

  private completedVisitsCte(businessId: string, before: Date): Prisma.Sql {
    return Prisma.sql`
      WITH visits AS (
        SELECT
          b."clientId",
          b."startAt",
          item_totals.revenue AS revenue,
          ROW_NUMBER() OVER (PARTITION BY b."clientId" ORDER BY b."startAt" ASC, b."id" ASC) AS visit_rank
        FROM "Booking" b
        ${this.itemTotalsJoin({ businessId, from: new Date(0), to: before })}
        WHERE b."businessId" = ${businessId}
          AND b."deletedAt" IS NULL
          AND b."status"::text = ${BookingStatus.COMPLETED}
          AND b."startAt" < ${before}::timestamptz AT TIME ZONE 'UTC'
      )
    `;
  }

  private recencyCase(asOf: Date, timezone: string): Prisma.Sql {
    const branches = CLIENT_RECENCY_BOUNDS.map((bound) =>
      this.recencyBranch(asOf, timezone, bound),
    );
    return Prisma.join(branches, ' ');
  }

  private recencyBranch(
    asOf: Date,
    timezone: string,
    bound: ClientRecencyBound,
  ): Prisma.Sql {
    const minCutoff = recencyCutoff(asOf, bound.minDays, timezone);
    if (bound.maxDays == null) {
      return Prisma.sql`WHEN "lastVisit" < ${minCutoff}::timestamptz AT TIME ZONE 'UTC' THEN ${bound.bucket}`;
    }
    const maxCutoff = recencyCutoff(asOf, bound.maxDays, timezone);
    return Prisma.sql`WHEN "lastVisit" < ${minCutoff}::timestamptz AT TIME ZONE 'UTC' AND "lastVisit" >= ${maxCutoff}::timestamptz AT TIME ZONE 'UTC' THEN ${bound.bucket}`;
  }

  /**
   * pgTruncUnit returns a value from a closed set ('hour'|'day'|'week'|'month'), so
   * Prisma.raw is safe here and lets the planner reuse the query plan across granularities.
   * startAt is stored as naive `timestamp` in UTC. First AT TIME ZONE 'UTC' tags it as
   * timestamptz, second AT TIME ZONE tz converts to wall-clock in the business timezone
   * for date_trunc, then the outer AT TIME ZONE tz maps the local midnight back to UTC.
   */
  private bucketExpr(
    granularity: SeriesGranularity,
    timezone: string,
    sourceAlias: 'b' | 'v' = 'b',
  ): Prisma.Sql {
    const trunc = Prisma.raw(`'${this.pgTruncUnit(granularity)}'`);
    const startAtColumn = Prisma.raw(`${sourceAlias}."startAt"`);
    return Prisma.sql`(date_trunc(${trunc}, (${startAtColumn} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})) AT TIME ZONE ${timezone}`;
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
        const _exhaustive: never = granularity;
        throw new Error(`Unhandled series granularity: ${_exhaustive}`);
      }
    }
  }
}

function mapCohortSummary(
  row:
    | {
        newVisits: bigint;
        returningVisits: bigint;
        activeClients: bigint;
        revenue: string;
      }
    | undefined,
): ClientCohortSummary {
  if (!row) {
    return {
      newVisits: 0,
      returningVisits: 0,
      activeClients: 0,
      revenue: MoneyService.decimal(0),
    };
  }
  return {
    newVisits: Number(row.newVisits),
    returningVisits: Number(row.returningVisits),
    activeClients: Number(row.activeClients),
    revenue: MoneyService.decimal(row.revenue),
  };
}
