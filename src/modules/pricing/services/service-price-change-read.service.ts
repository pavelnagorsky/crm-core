import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  PriceChange,
  PriceChangeCatalog,
  PriceChangeStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { ServicePriceChangeListRequestDto } from '../dto/service-price-change-list-request.dto.js';
import { PriceChangeItemRecord } from '../interfaces/price-change-item-record.interface.js';
import { PriceChangeSummaryView } from '../interfaces/price-change-summary-view.interface.js';
import { ServicePriceChangeDetailView } from '../interfaces/service-price-change-detail-view.interface.js';
import { ServicePriceUpcomingView } from '../interfaces/service-price-upcoming-view.interface.js';
import { groupChangeItems } from '../rules/service-price-change-detail.rules.js';
import { buildUpcoming } from '../rules/service-price-upcoming.rules.js';
import { PriceChangeHistoryService } from './price-change-history.service.js';

const toMinor = (value: Prisma.Decimal | null) =>
  value === null ? null : MoneyUtils.toMinor(value);

/** History, one change, and the upcoming hints of the service catalog. */
@Injectable()
export class ServicePriceChangeReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly history: PriceChangeHistoryService,
    private readonly locations: LocationService,
  ) {}

  /** SCHEDULED first by date, then the rest by the time they happened, newest first. */
  list(
    locationId: string,
    dto: ServicePriceChangeListRequestDto,
  ): Promise<
    PaginatedResult<PriceChangeSummaryView> & {
      counts: Record<PriceChangeStatus | 'all', number>;
    }
  > {
    return this.history.list(locationId, PriceChangeCatalog.SERVICES, dto);
  }

  /** 404 PRICE_CHANGE_NOT_FOUND for a change of another location or of products. */
  async findDetail(
    locationId: string,
    changeId: string,
    db: Prisma.TransactionClient = this.db,
    currents: ReadonlyMap<string, number | null> | null = null,
  ): Promise<ServicePriceChangeDetailView> {
    const change = await db.priceChange.findFirst({
      where: { id: changeId, locationId, catalog: PriceChangeCatalog.SERVICES },
      include: { items: true },
    });
    if (!change)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_NOT_FOUND,
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
    const [{ createdBy }] = await this.history.withAuthors([change]);
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
      this.db.priceChange.findMany({
        where: {
          locationId,
          catalog: PriceChangeCatalog.SERVICES,
          status: PriceChangeStatus.SCHEDULED,
        },
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
  withAuthors(changes: readonly PriceChange[]): Promise<PriceChangeSummaryView[]> {
    return this.history.withAuthors(changes);
  }
}
