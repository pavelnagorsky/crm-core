import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';

/**
 * What the "any staff" rules read about staff: how busy a staff member is on a day and
 * when they last got a booking. One query each, whatever the number of slots.
 */
@Injectable()
export class BookingStaffLoadService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Booking items per staff member and local day (YYYY-MM-DD) from `fromDate` to `toDate`
   * inclusive. One groupBy over the range; a day with no items has no entry.
   */
  async dayLoads(
    locationId: string,
    staffIds: readonly string[],
    fromDate: string,
    toDate: string,
    timezone: string,
  ): Promise<Map<string, Map<string, number>>> {
    const loads = new Map<string, Map<string, number>>();
    if (!staffIds.length) return loads;
    const rows = await this.db.bookingItem.groupBy({
      by: ['staffId', 'startAt'],
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        staffId: { in: [...staffIds] },
        startAt: {
          gte: TimeUtils.localToUtc(`${fromDate}T00:00:00`, timezone),
          lt: TimeUtils.localToUtc(
            `${TimeUtils.addDaysStr(toDate, 1)}T00:00:00`,
            timezone,
          ),
        },
      },
      _count: { id: true },
    });
    for (const row of rows) {
      const date = TimeUtils.zonedDateStr(row.startAt, timezone);
      const byDate = loads.get(row.staffId) ?? new Map<string, number>();
      byDate.set(date, (byDate.get(date) ?? 0) + row._count.id);
      loads.set(row.staffId, byDate);
    }
    return loads;
  }

  /**
   * When each staff member last got a booking (booking creation time, epoch ms), one query.
   * Staff who never got one are absent.
   */
  async lastAssignedAt(
    locationId: string,
    staffIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (!staffIds.length) return new Map();
    const rows = await this.db.$queryRaw<
      Array<{ staffId: string; lastAssignedAt: Date }>
    >(
      Prisma.sql`
        SELECT bi."staffId" AS "staffId", MAX(b."createdAt") AS "lastAssignedAt"
        FROM "BookingItem" bi
        JOIN "Booking" b ON b."id" = bi."bookingId"
        WHERE bi."locationId" = ${locationId}
          AND bi."staffId" IN (${Prisma.join([...staffIds])})
          AND b."deletedAt" IS NULL
        GROUP BY bi."staffId"
      `,
    );
    return new Map(
      rows.map((row) => [row.staffId, row.lastAssignedAt.getTime()]),
    );
  }
}
