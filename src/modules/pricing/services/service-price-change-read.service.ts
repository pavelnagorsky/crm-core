import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  ServicePriceChange,
  ServicePriceChangeStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { UserService } from '../../user/services/user.service.js';
import { SERVICE_PRICE_CHANGE_MAX_PAGE_SIZE } from '../constants/service-price-change.constants.js';
import { ServicePriceChangeListRequestDto } from '../dto/service-price-change-list-request.dto.js';
import { PriceChangeItemRecord } from '../interfaces/price-change-item-record.interface.js';
import { ServicePriceChangeDetailView } from '../interfaces/service-price-change-detail-view.interface.js';
import { ServicePriceChangeSummaryView } from '../interfaces/service-price-change-summary-view.interface.js';
import { ServicePriceUpcomingView } from '../interfaces/service-price-upcoming-view.interface.js';
import { groupChangeItems } from '../rules/service-price-change-detail.rules.js';
import { buildUpcoming } from '../rules/service-price-upcoming.rules.js';

const toMinor = (value: Prisma.Decimal | null) =>
  value === null ? null : MoneyUtils.toMinor(value);

/** History, one change, and the upcoming hints. */
@Injectable()
export class ServicePriceChangeReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly users: UserService,
    private readonly locations: LocationService,
  ) {}

  /** SCHEDULED first by date, then the rest by the time they happened, newest first. */
  async list(
    locationId: string,
    dto: ServicePriceChangeListRequestDto,
  ): Promise<
    PaginatedResult<ServicePriceChangeSummaryView> & {
      counts: Record<ServicePriceChangeStatus | 'all', number>;
    }
  > {
    const pageSize = Math.min(dto.pageSize, SERVICE_PRICE_CHANGE_MAX_PAGE_SIZE);
    const where: Prisma.ServicePriceChangeWhereInput = {
      locationId,
      ...(dto.status ? { status: dto.status } : {}),
    };
    const status = dto.status
      ? Prisma.sql`AND "status" = ${dto.status}::"ServicePriceChangeStatus"`
      : Prisma.empty;
    const [totalItems, ids, groups] = await Promise.all([
      this.db.servicePriceChange.count({ where }),
      this.db.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "ServicePriceChange"
        WHERE "locationId" = ${locationId} ${status}
        ORDER BY ("status" = 'SCHEDULED') DESC,
          CASE WHEN "status" = 'SCHEDULED' THEN "effectiveDate" END ASC,
          COALESCE("appliedAt", "cancelledAt", "createdAt") DESC,
          "id" ASC
        LIMIT ${pageSize} OFFSET ${(dto.page - 1) * pageSize}`,
      this.db.servicePriceChange.groupBy({
        by: ['status'],
        where: { locationId },
        _count: { _all: true },
      }),
    ]);
    const rows = await this.db.servicePriceChange.findMany({
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

  /** 404 SERVICE_PRICE_CHANGE_NOT_FOUND for a change of another location. */
  async findDetail(
    locationId: string,
    changeId: string,
    db: Prisma.TransactionClient = this.db,
    currents: ReadonlyMap<string, number | null> | null = null,
  ): Promise<ServicePriceChangeDetailView> {
    const change = await db.servicePriceChange.findFirst({
      where: { id: changeId, locationId },
      include: { items: true },
    });
    if (!change)
      throw new AppException(
        ErrorCode.SERVICE_PRICE_CHANGE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    const price = await this.catalog.loadPriceCatalog(locationId);
    const categories = new Map(price.categories.map((c) => [c.id, c.name]));
    const categoryOf = new Map<string, string | null>([
      ...price.services.map((s) => [s.id, categories.get(s.categoryId ?? '') ?? null] as const),
      ...price.bundles.map((b) => [b.id, categories.get(b.categoryId ?? '') ?? null] as const),
    ]);
    const items: PriceChangeItemRecord[] = change.items.map((item) => ({
      id: item.id,
      targetType: item.targetType,
      serviceId: item.serviceId,
      priceLevelId: item.priceLevelId,
      staffId: item.staffId,
      bundleId: item.bundleId,
      targetTitle: item.targetTitle,
      levelName: item.levelName,
      staffName: item.staffName,
      beforePrice: toMinor(item.beforePrice),
      afterPrice: toMinor(item.afterPrice),
      applySkip: item.applySkip,
      rollbackSkip: item.rollbackSkip,
      rolledBack: item.rolledBack,
      categoryName: categoryOf.get(item.serviceId ?? item.bundleId ?? '') ?? null,
    }));
    const [{ createdBy }] = await this.withAuthors([change]);
    return {
      change,
      createdBy,
      groups: groupChangeItems(items, currents),
    };
  }

  /** Hints for the services screen: the nearest scheduled date and scheduled prices. */
  async upcoming(
    locationId: string,
    now = new Date(),
  ): Promise<ServicePriceUpcomingView> {
    const { timezone } = await this.locations.getLocale(locationId);
    const today = TimeUtils.zonedDateStr(now, timezone);
    const [changes, price] = await Promise.all([
      this.db.servicePriceChange.findMany({
        where: { locationId, status: ServicePriceChangeStatus.SCHEDULED },
        orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          effectiveDate: true,
          items: {
            select: {
              targetType: true,
              serviceId: true,
              bundleId: true,
              afterPrice: true,
            },
          },
        },
      }),
      this.catalog.loadPriceCatalog(locationId),
    ]);
    return buildUpcoming(
      changes.map((change) => ({
        id: change.id,
        effectiveDate: TimeUtils.dateOnlyStr(change.effectiveDate),
        items: change.items.map((item) => ({
          ...item,
          afterPrice: toMinor(item.afterPrice),
        })),
      })),
      new Map(price.services.map((s) => [s.id, MoneyUtils.toMinor(s.price)])),
      new Map(
        price.bundles.flatMap((b) =>
          b.fixedPrice === null
            ? []
            : [[b.id, MoneyUtils.toMinor(b.fixedPrice)] as const],
        ),
      ),
      today,
    );
  }

  /** Author names by id; an author that no longer exists gives null. */
  async withAuthors(
    changes: readonly ServicePriceChange[],
  ): Promise<ServicePriceChangeSummaryView[]> {
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
}

/** Per-status totals of a location, zero for statuses without changes. */
function statusCounts(
  groups: { status: ServicePriceChangeStatus; _count: { _all: number } }[],
): Record<ServicePriceChangeStatus | 'all', number> {
  const counts = {
    all: 0,
    ...Object.fromEntries(Object.values(ServicePriceChangeStatus).map((s) => [s, 0])),
  } as Record<ServicePriceChangeStatus | 'all', number>;
  for (const group of groups) {
    counts[group.status] = group._count._all;
    counts.all += group._count._all;
  }
  return counts;
}
