import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { activeLocationSql } from '../../../../shared/database/active-business.sql.js';
import { ACTIVE_LOCATION_WHERE } from '../../../../shared/database/active-business.where.js';
import { ClientsService } from '../../../clients/services/clients.service.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../../services/catalog/service-catalog.facade.js';
import { ServiceCatalogKind } from '../../../services/enums/service-catalog-kind.enum.js';
import {
  CLIENT_FREQUENCY_LIMIT,
  POPULAR_SERVICES_DAYS,
  POPULAR_SERVICES_LIMIT,
} from '../../constants/booking-history.constants.js';
import { bookingWithItemsInclude } from '../../constants/booking-with-items.include.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingFrequencyRow } from '../../interfaces/booking-frequency-row.interface.js';
import { StaffBookingFrequencyRow } from '../../interfaces/staff-booking-frequency-row.interface.js';
import { BookingFrequency } from '../../interfaces/booking-frequency.interface.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { ClientBookingSummary } from '../../interfaces/client-booking-summary.interface.js';
import { ClientBookingVisit } from '../../interfaces/client-booking-visit.interface.js';
import { StaffPopularServices } from '../../interfaces/staff-popular-services.interface.js';
import { ACTIVE_BOOKING_STATUSES } from '../../rules/booking-cron.rules.js';

/**
 * Visit history read models for the manual booking dialog. Only completed visits count:
 * a bundle visit counts for the bundle, a visit without a bundle for each of its services.
 */
@Injectable()
export class BookingHistoryReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly clients: ClientsService,
    private readonly catalog: ServiceCatalogFacade,
  ) {}

  /** History of a brand client across all active locations of the brand. */
  async clientSummary(
    locationId: string,
    clientId: string,
    now = new Date(),
  ): Promise<ClientBookingSummary> {
    const { brandId } = await this.locations.findById(locationId);
    await this.clients.findInBrand(brandId, clientId);

    const booked: Prisma.BookingWhereInput = {
      clientId,
      deletedAt: null,
      location: ACTIVE_LOCATION_WHERE,
    };
    const completed = { ...booked, status: BookingStatus.COMPLETED };
    const ahead: Prisma.BookingWhereInput = {
      ...booked,
      status: { in: [...ACTIVE_BOOKING_STATUSES] },
      startAt: { gt: now },
    };
    const latestFirst = [{ startAt: 'desc' as const }, { id: 'desc' as const }];
    const [
      counts,
      upcomingCount,
      lastVisit,
      lastLocationVisit,
      upcoming,
      services,
      bundles,
    ] = await Promise.all([
      this.db.booking.groupBy({
        by: ['status'],
        where: {
          ...booked,
          status: { in: [BookingStatus.COMPLETED, BookingStatus.NO_SHOW] },
        },
        _count: { _all: true },
      }),
      this.db.booking.count({ where: ahead }),
      this.db.booking.findFirst({
        where: completed,
        orderBy: latestFirst,
        include: bookingWithItemsInclude,
      }),
      this.db.booking.findFirst({
        where: { ...completed, locationId },
        orderBy: latestFirst,
        include: bookingWithItemsInclude,
      }),
      this.db.booking.findFirst({
        where: ahead,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        include: bookingWithItemsInclude,
      }),
      this.clientServiceRows(clientId),
      this.clientBundleRows(clientId),
    ]);
    const bundleTitles = await this.catalog.findBundleTitles([
      ...new Set(
        [
          ...bundles.map((row) => row.id),
          ...[lastVisit, lastLocationVisit, upcoming].map(
            (booking) => booking?.bundleId,
          ),
        ].filter((id): id is string => Boolean(id)),
      ),
    ]);
    const visit = (booking: BookingWithItems | null) =>
      booking ? this.visit(booking, bundleTitles) : null;
    const countOf = (status: BookingStatus) =>
      counts.find((row) => row.status === status)?._count._all ?? 0;
    return {
      visits: countOf(BookingStatus.COMPLETED),
      noShows: countOf(BookingStatus.NO_SHOW),
      lastVisit: visit(lastVisit),
      lastLocationVisit: visit(lastLocationVisit),
      upcoming: visit(upcoming),
      upcomingCount,
      services: services.map((row) => this.frequency(row, bundleTitles)),
      bundles: bundles.map((row) => this.frequency(row, bundleTitles)),
    };
  }

  /** Per staff member, the services and bundles they completed most in the last 90 days. */
  async popularServices(
    locationId: string,
    now = new Date(),
  ): Promise<StaffPopularServices[]> {
    await this.locations.findById(locationId);
    const since = new Date(now.getTime() - POPULAR_SERVICES_DAYS * 86_400_000);
    const rows = await this.db.$queryRaw<StaffBookingFrequencyRow[]>(Prisma.sql`
      WITH visits AS (
        SELECT b."id" AS "bookingId", b."bundleId", b."startAt",
               bi."staffId", bi."serviceId", bi."serviceTitle"
        FROM "Booking" b
        JOIN "BookingItem" bi ON bi."bookingId" = b."id"
        WHERE b."locationId" = ${locationId}
          AND b."status" = 'COMPLETED'
          AND b."deletedAt" IS NULL
          AND b."startAt" >= ${since}
      ),
      frequencies AS (
        SELECT "staffId", ${ServiceCatalogKind.SERVICE}::text AS kind,
               "serviceId" AS id,
               COUNT(DISTINCT "bookingId")::int AS count,
               MAX("startAt") AS "lastAt",
               (ARRAY_AGG("serviceTitle" ORDER BY "startAt" DESC))[1] AS title
        FROM visits
        WHERE "bundleId" IS NULL
        GROUP BY "staffId", "serviceId"
        UNION ALL
        SELECT "staffId", ${ServiceCatalogKind.BUNDLE}::text AS kind,
               "bundleId" AS id,
               COUNT(DISTINCT "bookingId")::int AS count,
               MAX("startAt") AS "lastAt",
               NULL AS title
        FROM visits
        WHERE "bundleId" IS NOT NULL
        GROUP BY "staffId", "bundleId"
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY "staffId" ORDER BY count DESC, "lastAt" DESC, id
        ) AS rank
        FROM frequencies
      )
      SELECT "staffId", kind, id, ${locationId}::text AS "locationId",
             title, count, "lastAt"
      FROM ranked
      WHERE rank <= ${POPULAR_SERVICES_LIMIT}
      ORDER BY "staffId", rank
    `);
    const bundleTitles = await this.catalog.findBundleTitles([
      ...new Set(
        rows
          .filter((row) => row.kind === ServiceCatalogKind.BUNDLE)
          .map((row) => row.id),
      ),
    ]);
    const byStaff = new Map<string, BookingFrequency[]>();
    for (const row of rows) {
      const items = byStaff.get(row.staffId) ?? [];
      items.push(this.frequency(row, bundleTitles));
      byStaff.set(row.staffId, items);
    }
    return [...byStaff].map(([staffId, items]) => ({ staffId, items }));
  }

  private clientServiceRows(clientId: string): Promise<BookingFrequencyRow[]> {
    return this.db.$queryRaw<BookingFrequencyRow[]>(Prisma.sql`
      SELECT ${ServiceCatalogKind.SERVICE}::text AS kind,
             bi."serviceId" AS id, b."locationId",
             (ARRAY_AGG(bi."serviceTitle" ORDER BY b."startAt" DESC))[1] AS title,
             COUNT(DISTINCT b."id")::int AS count,
             MAX(b."startAt") AS "lastAt"
      FROM "Booking" b
      JOIN "BookingItem" bi ON bi."bookingId" = b."id"
      WHERE b."clientId" = ${clientId}
        AND b."status" = 'COMPLETED'
        AND b."deletedAt" IS NULL
        AND b."bundleId" IS NULL
        AND ${activeLocationSql(Prisma.sql`b."locationId"`)}
      GROUP BY bi."serviceId", b."locationId"
      ORDER BY count DESC, "lastAt" DESC, id
      LIMIT ${CLIENT_FREQUENCY_LIMIT}
    `);
  }

  private clientBundleRows(clientId: string): Promise<BookingFrequencyRow[]> {
    return this.db.$queryRaw<BookingFrequencyRow[]>(Prisma.sql`
      SELECT ${ServiceCatalogKind.BUNDLE}::text AS kind,
             b."bundleId" AS id, b."locationId",
             NULL AS title,
             COUNT(*)::int AS count,
             MAX(b."startAt") AS "lastAt"
      FROM "Booking" b
      WHERE b."clientId" = ${clientId}
        AND b."status" = 'COMPLETED'
        AND b."deletedAt" IS NULL
        AND b."bundleId" IS NOT NULL
        AND ${activeLocationSql(Prisma.sql`b."locationId"`)}
      GROUP BY b."bundleId", b."locationId"
      ORDER BY count DESC, "lastAt" DESC, id
      LIMIT ${CLIENT_FREQUENCY_LIMIT}
    `);
  }

  private frequency(
    row: BookingFrequencyRow,
    bundleTitles: ReadonlyMap<string, string>,
  ): BookingFrequency {
    return {
      kind: row.kind,
      id: row.id,
      locationId: row.locationId,
      title:
        row.kind === ServiceCatalogKind.BUNDLE
          ? (bundleTitles.get(row.id) ?? '')
          : (row.title ?? ''),
      count: row.count,
      lastAt: row.lastAt,
    };
  }

  private visit(
    booking: BookingWithItems,
    bundleTitles: ReadonlyMap<string, string>,
  ): ClientBookingVisit {
    return {
      booking,
      bundleTitle: booking.bundleId
        ? (bundleTitles.get(booking.bundleId) ?? null)
        : null,
    };
  }
}
