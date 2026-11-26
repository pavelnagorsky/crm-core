import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PriceChange,
  PriceChangeCatalog,
  PriceChangeStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { UserService } from '../../user/services/user.service.js';
import { PRICE_CHANGE_MAX_PAGE_SIZE } from '../constants/price-change.constants.js';
import { PriceChangeListQuery } from '../interfaces/price-change-list-query.interface.js';
import { PriceChangeSummaryView } from '../interfaces/price-change-summary-view.interface.js';

/** The history of the price changes of one catalog, and the author names of changes. */
@Injectable()
export class PriceChangeHistoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UserService,
  ) {}

  /** SCHEDULED first by date, then the rest by the time they happened, newest first. */
  async list(
    locationId: string,
    catalog: PriceChangeCatalog,
    query: PriceChangeListQuery,
  ): Promise<
    PaginatedResult<PriceChangeSummaryView> & {
      counts: Record<PriceChangeStatus | 'all', number>;
    }
  > {
    const pageSize = Math.min(query.pageSize, PRICE_CHANGE_MAX_PAGE_SIZE);
    const where: Prisma.PriceChangeWhereInput = {
      locationId,
      catalog,
      ...(query.status ? { status: query.status } : {}),
    };
    const status = query.status
      ? Prisma.sql`AND "status" = ${query.status}::"PriceChangeStatus"`
      : Prisma.empty;
    const [totalItems, ids, groups] = await Promise.all([
      this.db.priceChange.count({ where }),
      this.db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "PriceChange"
        WHERE "locationId" = ${locationId}
          AND "catalog" = ${catalog}::"PriceChangeCatalog" ${status}
        ORDER BY ("status" = 'SCHEDULED') DESC,
          CASE WHEN "status" = 'SCHEDULED' THEN "effectiveDate" END ASC,
          COALESCE("appliedAt", "cancelledAt", "createdAt") DESC,
          "id" ASC
        LIMIT ${pageSize} OFFSET ${(query.page - 1) * pageSize}`,
      this.db.priceChange.groupBy({
        by: ['status'],
        where: { locationId, catalog },
        _count: { _all: true },
      }),
    ]);
    const rows = await this.db.priceChange.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const changes = ids.flatMap(({ id }) => {
      const change = byId.get(id);
      return change ? [change] : [];
    });
    return {
      items: await this.withAuthors(changes),
      totalItems,
      counts: statusCounts(groups),
    };
  }

  /** Author names by id; an author that no longer exists gives null. */
  async withAuthors(
    changes: readonly PriceChange[],
  ): Promise<PriceChangeSummaryView[]> {
    const ids = [
      ...new Set(changes.flatMap((c) => (c.createdById ? [c.createdById] : []))),
    ];
    const users = await this.users.findAccessParticipants(ids);
    const names = new Map(
      users.map((user) => [
        user.id,
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          user.email ||
          'Пользователь',
      ]),
    );
    return changes.map((change) => ({
      change,
      createdBy:
        change.createdById && names.has(change.createdById)
          ? { id: change.createdById, name: names.get(change.createdById)! }
          : null,
    }));
  }

  /** The summary of one stored change, or null when it is gone. */
  async findSummary(changeId: string): Promise<PriceChangeSummaryView | null> {
    const change = await this.db.priceChange.findUnique({
      where: { id: changeId },
    });
    if (!change) return null;
    const [view] = await this.withAuthors([change]);
    return view;
  }
}

/** Per-status totals of a location, zero for statuses without changes. */
function statusCounts(
  groups: { status: PriceChangeStatus; _count: { _all: number } }[],
): Record<PriceChangeStatus | 'all', number> {
  const counts = {
    all: 0,
    ...Object.fromEntries(Object.values(PriceChangeStatus).map((s) => [s, 0])),
  } as Record<PriceChangeStatus | 'all', number>;
  for (const group of groups) {
    counts[group.status] = group._count._all;
    counts.all += group._count._all;
  }
  return counts;
}
