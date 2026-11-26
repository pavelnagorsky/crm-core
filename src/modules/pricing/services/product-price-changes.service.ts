import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PriceChangeCatalog,
  PriceChangeSource,
  PriceChangeTarget,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PRICE_CHANGE_TX_TIMEOUT_MS } from '../constants/price-change.constants.js';
import { CreateProductPriceChangeDto } from '../dto/create-product-price-change.dto.js';
import { PriceChangeItemDraft } from '../interfaces/price-change-item-draft.interface.js';
import { ProductPriceChangeDetailView } from '../interfaces/product-price-change-detail-view.interface.js';
import { ProductPriceChangeRollbackView } from '../interfaces/product-price-change-rollback-view.interface.js';
import { selectChangedRows } from '../rules/price-change-select.rules.js';
import { parseProductPriceChangeSpec } from '../rules/product-price-change-rows.rules.js';
import { PriceChangeApplier } from './price-change-applier.service.js';
import { PriceChangeLifecycleService } from './price-change-lifecycle.service.js';
import { PriceChangeLock } from './price-change-lock.service.js';
import { PriceChangeWriter } from './price-change-writer.service.js';
import { ProductPriceChangePreviewService } from './product-price-change-preview.service.js';
import { ProductPriceChangeReadService } from './product-price-change-read.service.js';

/** Creates, cancels and rolls back the product price changes of a location. */
@Injectable()
export class ProductPriceChangesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly lock: PriceChangeLock,
    private readonly applier: PriceChangeApplier,
    private readonly previews: ProductPriceChangePreviewService,
    private readonly writer: PriceChangeWriter,
    private readonly lifecycle: PriceChangeLifecycleService,
    private readonly reads: ProductPriceChangeReadService,
  ) {}

  /**
   * Recomputes the rule under the location lock (the one lock of both catalogs), takes the
   * selected rows with the manual prices, and stores the change: applied at once without a
   * date, scheduled with one. STALE / ROW_INVALID / EMPTY / DATE_CONFLICT / LIMIT as for
   * services.
   */
  async create(
    locationId: string,
    dto: CreateProductPriceChangeDto,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ProductPriceChangeDetailView> {
    const spec = parseProductPriceChangeSpec(dto);
    const result = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        const preview = await this.previews.compute(
          locationId,
          spec,
          false,
          now,
          tx,
        );
        const selected = selectChangedRows(
          preview.rows,
          dto.selectedKeys,
          dto.overrides.map(({ key, price }) => ({
            key,
            price: MoneyUtils.toMinor(price),
          })),
          () => false,
        );
        const items = selected.map(
          ({ row, after }): PriceChangeItemDraft => ({
            targetType: PriceChangeTarget.PRODUCT,
            serviceId: null,
            priceLevelId: null,
            staffId: null,
            bundleId: null,
            productLocationId: row.productLocationId,
            targetTitle: row.title.slice(0, 150),
            levelName: null,
            staffName: null,
            beforePrice: MoneyUtils.fromMinor(row.before),
            afterPrice: after === null ? null : MoneyUtils.fromMinor(after),
          }),
        );
        return this.writer.write(tx, {
          locationId,
          catalog: PriceChangeCatalog.PRODUCTS,
          source: PriceChangeSource.RULE,
          effectiveDate: spec.effectiveDate,
          ruleSpec: {
            mode: dto.mode,
            value: dto.value,
            priceRoundingStep: dto.priceRoundingStep,
          },
          fileName: null,
          createdServicesCount: 0,
          items,
          productIds: new Map(
            preview.rows.map((row) => [row.productLocationId, row.productId]),
          ),
          actor,
          now,
        });
      },
      { timeout: PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    if (!result)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_EMPTY,
        HttpStatus.BAD_REQUEST,
      );
    await this.writer.afterCommit(locationId, result, actor);
    return this.reads.findDetail(locationId, result.changeId);
  }

  /** SCHEDULED to CANCELLED; the prices are not touched. 409 PRICE_CHANGE_NOT_SCHEDULED otherwise. */
  async cancel(
    locationId: string,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ProductPriceChangeDetailView> {
    await this.lifecycle.cancel(
      locationId,
      PriceChangeCatalog.PRODUCTS,
      changeId,
      actor,
      now,
    );
    return this.reads.findDetail(locationId, changeId);
  }

  /**
   * Writes "before" back where the retail price still equals "after"; other rows get
   * CHANGED_AFTER / TARGET_DELETED / NOT_FOR_SALE. 409 PRICE_CHANGE_NOT_APPLIED otherwise.
   */
  async rollback(
    locationId: string,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ProductPriceChangeRollbackView> {
    const { restoredCount, currents } = await this.lifecycle.rollback(
      locationId,
      PriceChangeCatalog.PRODUCTS,
      changeId,
      actor,
      now,
    );
    const detail = await this.reads.findDetail(locationId, changeId, currents);
    return {
      detail,
      restoredCount,
      skipped: detail.rows.filter((row) => row.rollbackSkip !== null),
    };
  }
}
