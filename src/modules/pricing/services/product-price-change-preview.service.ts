import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { InventoryFacade } from '../../inventory/inventory.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { PricedLocationProduct } from '../../products/interfaces/priced-location-product.interface.js';
import { ProductsService } from '../../products/services/products.service.js';
import { PRICE_CHANGE_MAX_ITEMS } from '../constants/price-change.constants.js';
import { ProductPriceChangeSpecDto } from '../dto/product-price-change-spec.dto.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ProductPriceChangePreview } from '../interfaces/product-price-change-preview.interface.js';
import { ProductPriceChangeSpec } from '../interfaces/product-price-change-spec.interface.js';
import {
  buildProductPriceChangeRows,
  countProductPriceChangeRows,
  parseProductPriceChangeSpec,
  selectProductScope,
} from '../rules/product-price-change-rows.rules.js';
import {
  assertPriceChangeDate,
  priceChangeInvalid,
} from '../rules/service-price-change-spec.rules.js';
import { PriceChangeWriter } from './price-change-writer.service.js';
import { ScheduledPriceChangeReadService } from './scheduled-price-change-read.service.js';

/** Computes the rows of a product price change rule: each retail price on the date and after. */
@Injectable()
export class ProductPriceChangePreviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryFacade,
    private readonly locations: LocationService,
    private readonly scheduled: ScheduledPriceChangeReadService,
    private readonly writer: PriceChangeWriter,
  ) {}

  /** The preview of a rule request. */
  preview(
    locationId: string,
    dto: ProductPriceChangeSpecDto,
    canReadCost: boolean,
    now = new Date(),
  ): Promise<ProductPriceChangePreview> {
    return this.compute(
      locationId,
      parseProductPriceChangeSpec(dto),
      canReadCost,
      now,
    );
  }

  /**
   * Preview of a parsed rule. 400 for a bad scope, date or size. Reads fresh data, so the
   * create runs the same computation under the location lock.
   */
  async compute(
    locationId: string,
    spec: ProductPriceChangeSpec,
    canReadCost: boolean,
    now: Date,
    db: Prisma.TransactionClient = this.db,
  ): Promise<ProductPriceChangePreview> {
    const { timezone } = await this.locations.getLocale(locationId, db);
    const today = TimeUtils.zonedDateStr(now, timezone);
    assertPriceChangeDate(spec.effectiveDate, today);
    const date = spec.effectiveDate ?? today;
    const [priced, entries] = await Promise.all([
      this.products.listPriced(locationId, db),
      this.scheduled.listForSnapshot(locationId, db),
    ]);
    await this.assertScope(locationId, spec, priced, db);
    const scope = selectProductScope(priced, spec);
    if (scope.length > PRICE_CHANGE_MAX_ITEMS)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_TOO_LARGE,
        HttpStatus.BAD_REQUEST,
        { max: PRICE_CHANGE_MAX_ITEMS },
      );
    const costs = await this.inventory.lastPurchaseUnitCosts(
      locationId,
      scope.map((product) => product.productLocationId),
      db,
    );
    const rows = buildProductPriceChangeRows(
      scope,
      spec,
      date,
      new PriceTimeline(entries),
      costs,
      canReadCost,
    );
    const conflicts =
      spec.effectiveDate === null
        ? []
        : await this.writer.findConflicts(db, locationId, spec.effectiveDate, {
            productIds: new Map(
              rows.map((row) => [row.productLocationId, row.productId]),
            ),
          });
    return {
      date,
      rows,
      counts: countProductPriceChangeRows(rows),
      conflicts,
    };
  }

  /**
   * 400 PRICE_CHANGE_INVALID { field }: `productIds` must be products the location sells,
   * `categoryIds` product categories of the brand.
   */
  private async assertScope(
    locationId: string,
    spec: ProductPriceChangeSpec,
    priced: readonly PricedLocationProduct[],
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (spec.allProducts) return;
    const sold = new Set(priced.map((product) => product.productId));
    if (!spec.productIds.every((id) => sold.has(id)))
      throw priceChangeInvalid('productIds');
    if (spec.categoryIds.length === 0) return;
    const { brandId } = await this.locations.findById(locationId, db);
    const categories = new Set(
      (await this.products.listCategories(brandId)).map((category) => category.id),
    );
    if (!spec.categoryIds.every((id) => categories.has(id)))
      throw priceChangeInvalid('categoryIds');
  }
}
