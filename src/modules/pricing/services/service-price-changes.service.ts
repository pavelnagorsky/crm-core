import { HttpStatus, Injectable } from '@nestjs/common';
import { PriceChangeCatalog, PriceChangeSource } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PRICE_CHANGE_TX_TIMEOUT_MS } from '../constants/price-change.constants.js';
import { CreateServicePriceChangeDto } from '../dto/create-service-price-change.dto.js';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeItemDraft } from '../interfaces/price-change-item-draft.interface.js';
import { ServicePriceChangeDetailView } from '../interfaces/service-price-change-detail-view.interface.js';
import { ServicePriceChangeRollbackView } from '../interfaces/service-price-change-rollback-view.interface.js';
import { selectPriceChangeRows } from '../rules/service-price-change-select.rules.js';
import { parsePriceChangeSpec } from '../rules/service-price-change-spec.rules.js';
import { PriceChangeApplier } from './price-change-applier.service.js';
import { PriceChangeLifecycleService } from './price-change-lifecycle.service.js';
import { PriceChangeLock } from './price-change-lock.service.js';
import { PriceChangeWriter } from './price-change-writer.service.js';
import { ServicePriceChangePreviewService } from './service-price-change-preview.service.js';
import { ServicePriceChangeReadService } from './service-price-change-read.service.js';

const toDecimal = (minor: number | null) =>
  minor === null ? null : MoneyUtils.fromMinor(minor);

/** Creates, cancels and rolls back the service price changes of a location. */
@Injectable()
export class ServicePriceChangesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly lock: PriceChangeLock,
    private readonly applier: PriceChangeApplier,
    private readonly previews: ServicePriceChangePreviewService,
    private readonly writer: PriceChangeWriter,
    private readonly lifecycle: PriceChangeLifecycleService,
    private readonly reads: ServicePriceChangeReadService,
  ) {}

  /**
   * Recomputes the rule under the location lock, takes the selected rows with the manual
   * prices, and stores the change: applied at once without a date, scheduled with one.
   */
  async create(
    locationId: string,
    dto: CreateServicePriceChangeDto,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ServicePriceChangeDetailView> {
    const spec = parsePriceChangeSpec(dto);
    const result = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        const preview = await this.previews.compute(
          locationId,
          spec,
          now,
          tx,
        );
        const selected = selectPriceChangeRows(
          preview.groups,
          dto.selectedKeys,
          dto.overrides.map(({ key, price }) => ({
            key,
            price: price === null ? null : MoneyUtils.toMinor(price),
          })),
        );
        const items = selected.map(
          ({ group, row, after }): PriceChangeItemDraft => ({
            targetType: row.targetType,
            serviceId:
              group.kind === ServicePriceChangeGroupKind.SERVICE ? group.id : null,
            priceLevelId: row.levelId,
            staffId: row.staffId,
            bundleId:
              group.kind === ServicePriceChangeGroupKind.BUNDLE ? group.id : null,
            productLocationId: null,
            targetTitle: group.title.slice(0, 150),
            levelName: row.levelName,
            staffName: row.staffName,
            beforePrice: toDecimal(row.before),
            afterPrice: toDecimal(after),
          }),
        );
        return this.writer.write(tx, {
          locationId,
          catalog: PriceChangeCatalog.SERVICES,
          source: PriceChangeSource.RULE,
          effectiveDate: spec.effectiveDate,
          ruleSpec: {
            mode: dto.mode,
            value: dto.value,
            priceRoundingStep: dto.priceRoundingStep,
            include: { ...dto.include },
          },
          fileName: null,
          createdServicesCount: 0,
          items,
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
  ): Promise<ServicePriceChangeDetailView> {
    await this.lifecycle.cancel(
      locationId,
      PriceChangeCatalog.SERVICES,
      changeId,
      actor,
      now,
    );
    return this.reads.findDetail(locationId, changeId);
  }

  /**
   * Returns the "before" prices of an APPLIED change where the stored price still equals
   * "after"; other rows stay and get the reason. 409 PRICE_CHANGE_NOT_APPLIED otherwise.
   */
  async rollback(
    locationId: string,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ServicePriceChangeRollbackView> {
    const { restoredCount, currents } = await this.lifecycle.rollback(
      locationId,
      PriceChangeCatalog.SERVICES,
      changeId,
      actor,
      now,
    );
    const detail = await this.reads.findDetail(
      locationId,
      changeId,
      this.db,
      currents,
    );
    return {
      detail,
      restoredCount,
      skipped: detail.groups
        .flatMap((group) => group.rows)
        .filter((row) => row.rollbackSkip !== null),
    };
  }
}
