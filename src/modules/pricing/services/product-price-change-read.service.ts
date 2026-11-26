import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PriceChangeCatalog,
  PriceChangeStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { PriceChangeListQuery } from '../interfaces/price-change-list-query.interface.js';
import { PriceChangeSummaryView } from '../interfaces/price-change-summary-view.interface.js';
import { ProductPriceChangeDetailView } from '../interfaces/product-price-change-detail-view.interface.js';
import { ProductPriceUpcomingView } from '../interfaces/product-price-upcoming-view.interface.js';
import { productChangeItemRows } from '../rules/product-price-change-detail.rules.js';
import { buildProductUpcoming } from '../rules/product-price-upcoming.rules.js';
import { PriceChangeHistoryService } from './price-change-history.service.js';

/** History, one change, and the upcoming hints of the product catalog. */
@Injectable()
export class ProductPriceChangeReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly history: PriceChangeHistoryService,
    private readonly locations: LocationService,
  ) {}

  /** SCHEDULED first by date, then the rest by the time they happened, newest first. */
  list(
    locationId: string,
    query: PriceChangeListQuery,
  ): Promise<
    PaginatedResult<PriceChangeSummaryView> & {
      counts: Record<PriceChangeStatus | 'all', number>;
    }
  > {
    return this.history.list(locationId, PriceChangeCatalog.PRODUCTS, query);
  }

  /** 404 PRICE_CHANGE_NOT_FOUND for a change of another location or of services. */
  async findDetail(
    locationId: string,
    changeId: string,
    currents: ReadonlyMap<string, number | null> | null = null,
  ): Promise<ProductPriceChangeDetailView> {
    const change = await this.db.priceChange.findFirst({
      where: { id: changeId, locationId, catalog: PriceChangeCatalog.PRODUCTS },
      include: { items: true },
    });
    if (!change)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    const { items, ...stored } = change;
    const refs = await this.products.findLocationRefsByIds(
      items.flatMap((item) =>
        item.productLocationId ? [item.productLocationId] : [],
      ),
    );
    const [{ createdBy }] = await this.history.withAuthors([stored]);
    return {
      change: stored,
      createdBy,
      rows: productChangeItemRows(
        items,
        new Map(refs.map((ref) => [ref.productLocationId, ref])),
        currents,
      ),
    };
  }

  /** Hints for the products screen: the nearest scheduled date and scheduled retail prices. */
  async upcoming(
    locationId: string,
    now = new Date(),
  ): Promise<ProductPriceUpcomingView> {
    const { timezone } = await this.locations.getLocale(locationId);
    const today = TimeUtils.zonedDateStr(now, timezone);
    const [changes, priced] = await Promise.all([
      this.db.priceChange.findMany({
        where: {
          locationId,
          catalog: PriceChangeCatalog.PRODUCTS,
          status: PriceChangeStatus.SCHEDULED,
          effectiveDate: { gt: TimeUtils.dateOnly(today) },
        },
        orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          effectiveDate: true,
          items: { select: { productLocationId: true, afterPrice: true } },
        },
      }),
      this.products.listPriced(locationId),
    ]);
    return buildProductUpcoming(
      changes.map((change) => ({
        id: change.id,
        effectiveDate: TimeUtils.dateOnlyStr(change.effectiveDate),
        items: change.items.map((item) => ({
          productLocationId: item.productLocationId,
          afterPrice: toMinor(item.afterPrice),
        })),
      })),
      new Map(
        priced.map((product) => [
          product.productLocationId,
          {
            productId: product.productId,
            price: MoneyUtils.toMinor(product.retailPrice),
          },
        ]),
      ),
      today,
    );
  }
}

function toMinor(value: Prisma.Decimal | null): number | null {
  return value === null ? null : MoneyUtils.toMinor(value);
}
