import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  ServicePriceChangeSource,
  ServicePriceChangeStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { SERVICE_PRICE_CHANGE_TX_TIMEOUT_MS } from '../constants/service-price-change.constants.js';
import { CreateServicePriceChangeDto } from '../dto/create-service-price-change.dto.js';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeItemMark } from '../interfaces/price-change-item-mark.interface.js';
import { ServicePriceChangeItemDraft } from '../interfaces/service-price-change-item-draft.interface.js';
import { PriceChangeWrite } from '../interfaces/price-change-write.interface.js';
import { ServicePriceChangeDetailView } from '../interfaces/service-price-change-detail-view.interface.js';
import { ServicePriceChangeRollbackView } from '../interfaces/service-price-change-rollback-view.interface.js';
import { rollbackDecision } from '../rules/service-price-change-apply.rules.js';
import { selectPriceChangeRows } from '../rules/service-price-change-select.rules.js';
import { parsePriceChangeSpec } from '../rules/service-price-change-spec.rules.js';
import { ServicePriceChangeApplier } from './service-price-change-applier.service.js';
import { ServicePriceChangeLock } from './service-price-change-lock.service.js';
import { ServicePriceChangePreviewService } from './service-price-change-preview.service.js';
import { ServicePriceChangeReadService } from './service-price-change-read.service.js';
import { ServicePriceChangeStore } from './service-price-change-store.service.js';
import { ServicePriceChangeWriter } from './service-price-change-writer.service.js';

const toDecimal = (minor: number | null) =>
  minor === null ? null : MoneyUtils.fromMinor(minor);
const toMinor = (value: Prisma.Decimal | null) =>
  value === null ? null : MoneyUtils.toMinor(value);

/** Creates, cancels and rolls back price changes of a location. */
@Injectable()
export class ServicePriceChangesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly lock: ServicePriceChangeLock,
    private readonly applier: ServicePriceChangeApplier,
    private readonly previews: ServicePriceChangePreviewService,
    private readonly writer: ServicePriceChangeWriter,
    private readonly store: ServicePriceChangeStore,
    private readonly reads: ServicePriceChangeReadService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
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
          ({ group, row, after }): ServicePriceChangeItemDraft => ({
            targetType: row.targetType,
            serviceId:
              group.kind === ServicePriceChangeGroupKind.SERVICE ? group.id : null,
            priceLevelId: row.levelId,
            staffId: row.staffId,
            bundleId:
              group.kind === ServicePriceChangeGroupKind.BUNDLE ? group.id : null,
            targetTitle: group.title.slice(0, 150),
            levelName: row.levelName,
            staffName: row.staffName,
            beforePrice: toDecimal(row.before),
            afterPrice: toDecimal(after),
          }),
        );
        return this.writer.write(tx, {
          locationId,
          source: ServicePriceChangeSource.RULE,
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
      { timeout: SERVICE_PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    if (!result)
      throw new AppException(
        ErrorCode.SERVICE_PRICE_CHANGE_EMPTY,
        HttpStatus.BAD_REQUEST,
      );
    await this.writer.afterCommit(locationId, result, actor);
    return this.reads.findDetail(locationId, result.changeId);
  }

  /** SCHEDULED to CANCELLED; the prices are not touched. 409 SERVICE_PRICE_CHANGE_NOT_SCHEDULED otherwise. */
  async cancel(
    locationId: string,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ServicePriceChangeDetailView> {
    const { title, effectiveDate, dueApplied } = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        const change = await this.findInLocation(tx, locationId, changeId);
        if (change.status !== ServicePriceChangeStatus.SCHEDULED)
          throw new AppException(
            ErrorCode.SERVICE_PRICE_CHANGE_NOT_SCHEDULED,
            HttpStatus.CONFLICT,
            { status: change.status },
          );
        await tx.servicePriceChange.update({
          where: { id: changeId },
          data: {
            status: ServicePriceChangeStatus.CANCELLED,
            cancelledAt: now,
            cancelledById: actor.id ?? null,
          },
        });
        return {
          title: change.title,
          effectiveDate: TimeUtils.dateOnlyStr(change.effectiveDate),
          dueApplied: this.applier.takeDueApplied(tx),
        };
      },
      { timeout: SERVICE_PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    await this.writer.afterCommitDue(locationId, dueApplied);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    this.emit(changeId, locationId, actor, AuditEvent.SERVICE_PRICE_CHANGE_CANCELLED, {
      title,
      effectiveDate,
    });
    return this.reads.findDetail(locationId, changeId);
  }

  /**
   * Returns the "before" prices of an APPLIED change where the stored price still equals
   * "after"; other rows stay and get the reason. 409 SERVICE_PRICE_CHANGE_NOT_APPLIED
   * otherwise.
   */
  async rollback(
    locationId: string,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ServicePriceChangeRollbackView> {
    const done = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        const found = await this.findInLocation(tx, locationId, changeId);
        if (found.status !== ServicePriceChangeStatus.APPLIED)
          throw new AppException(
            ErrorCode.SERVICE_PRICE_CHANGE_NOT_APPLIED,
            HttpStatus.CONFLICT,
            { status: found.status },
          );
        const items = await tx.servicePriceChangeItem.findMany({
          where: { changeId },
        });
        const states = await this.store.loadStates(tx, items);
        const writes: PriceChangeWrite[] = [];
        const marks: PriceChangeItemMark[] = [];
        const currents = new Map<string, number | null>();
        for (const item of items) {
          const state = states.get(item.id)!;
          const decision = rollbackDecision(
            {
              applySkip: item.applySkip,
              beforePrice: toMinor(item.beforePrice),
              afterPrice: toMinor(item.afterPrice),
            },
            state,
          );
          if (decision.kind === 'IGNORE') continue;
          currents.set(item.id, state.current);
          if (decision.kind === 'RESTORE') {
            writes.push({ itemId: item.id, price: decision.price });
            marks.push({ itemId: item.id, before: null, skip: null, rolledBack: true });
          } else
            marks.push({ itemId: item.id, before: null, skip: decision.skip, rolledBack: false });
        }
        await this.store.writePrices(
          tx,
          new Map(items.map((item) => [item.id, item])),
          writes,
        );
        await this.store.markRolledBack(tx, marks);
        const rollbackSkippedCount = marks.length - writes.length;
        await tx.servicePriceChange.update({
          where: { id: changeId },
          data: {
            status: ServicePriceChangeStatus.ROLLED_BACK,
            rolledBackAt: now,
            rolledBackById: actor.id ?? null,
            rollbackSkippedCount,
          },
        });
        return {
          title: found.title,
          restoredCount: writes.length,
          rollbackSkippedCount,
          currents,
          dueApplied: this.applier.takeDueApplied(tx),
        };
      },
      { timeout: SERVICE_PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    await this.writer.afterCommitDue(locationId, done.dueApplied);
    await Promise.all([
      this.cache.invalidate(CacheDependency.pricing(locationId)),
      this.cache.invalidate(CacheDependency.serviceCatalog(locationId)),
    ]);
    this.emit(changeId, locationId, actor, AuditEvent.SERVICE_PRICE_CHANGE_ROLLED_BACK, {
      title: done.title,
      restoredCount: done.restoredCount,
      rollbackSkippedCount: done.rollbackSkippedCount,
    });
    const detail = await this.reads.findDetail(
      locationId,
      changeId,
      this.db,
      done.currents,
    );
    return {
      detail,
      restoredCount: done.restoredCount,
      skipped: detail.groups
        .flatMap((group) => group.rows)
        .filter((row) => row.rollbackSkip !== null),
    };
  }

  private async findInLocation(
    tx: Prisma.TransactionClient,
    locationId: string,
    changeId: string,
  ) {
    const change = await tx.servicePriceChange.findFirst({
      where: { id: changeId, locationId },
    });
    if (!change)
      throw new AppException(
        ErrorCode.SERVICE_PRICE_CHANGE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return change;
  }

  private emit(
    changeId: string,
    locationId: string,
    actor: AuditActor,
    eventType: AuditEvent,
    payload: AuditLogEvent['payload'],
  ): void {
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE_PRICE_CHANGE,
      entityId: changeId,
      eventType,
      actionType: AuditActionType.ACTION,
      occurredAt: new Date(),
      actor,
      payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
