import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeStatus,
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
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { PRICE_CHANGE_AUDIT } from '../constants/price-change-audit.constants.js';
import { PRICE_CHANGE_TX_TIMEOUT_MS } from '../constants/price-change.constants.js';
import { PriceChangeItemMark } from '../interfaces/price-change-item-mark.interface.js';
import { PriceChangeRollbackOutcome } from '../interfaces/price-change-rollback-outcome.interface.js';
import { PriceChangeWrite } from '../interfaces/price-change-write.interface.js';
import { priceChangeCatalogCache } from '../rules/price-change-cache.rules.js';
import { rollbackDecision } from '../rules/service-price-change-apply.rules.js';
import { PriceChangeApplier } from './price-change-applier.service.js';
import { PriceChangeLock } from './price-change-lock.service.js';
import { PriceChangeStore } from './price-change-store.service.js';
import { PriceChangeWriter } from './price-change-writer.service.js';

const toMinor = (value: Prisma.Decimal | null) =>
  value === null ? null : MoneyUtils.toMinor(value);

/**
 * Cancel and rollback of a stored change, the same for both catalogs. A change of another
 * catalog or location is 404 PRICE_CHANGE_NOT_FOUND.
 */
@Injectable()
export class PriceChangeLifecycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly lock: PriceChangeLock,
    private readonly applier: PriceChangeApplier,
    private readonly writer: PriceChangeWriter,
    private readonly store: PriceChangeStore,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** SCHEDULED to CANCELLED; the prices are not touched. 409 PRICE_CHANGE_NOT_SCHEDULED otherwise. */
  async cancel(
    locationId: string,
    catalog: PriceChangeCatalog,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<void> {
    const { title, effectiveDate, dueApplied } = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        const change = await this.findInLocation(tx, locationId, catalog, changeId);
        if (change.status !== PriceChangeStatus.SCHEDULED)
          throw new AppException(
            ErrorCode.PRICE_CHANGE_NOT_SCHEDULED,
            HttpStatus.CONFLICT,
            { status: change.status },
          );
        await tx.priceChange.update({
          where: { id: changeId },
          data: {
            status: PriceChangeStatus.CANCELLED,
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
      { timeout: PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    await this.writer.afterCommitDue(locationId, dueApplied);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    this.emit(catalog, changeId, locationId, actor, PRICE_CHANGE_AUDIT[catalog].cancelled, {
      title,
      effectiveDate,
    });
  }

  /**
   * Returns the "before" prices of an APPLIED change where the stored price still equals
   * "after"; other rows stay and get the reason. 409 PRICE_CHANGE_NOT_APPLIED otherwise.
   */
  async rollback(
    locationId: string,
    catalog: PriceChangeCatalog,
    changeId: string,
    actor: AuditActor,
    now = new Date(),
  ): Promise<PriceChangeRollbackOutcome> {
    const done = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        const found = await this.findInLocation(tx, locationId, catalog, changeId);
        if (found.status !== PriceChangeStatus.APPLIED)
          throw new AppException(
            ErrorCode.PRICE_CHANGE_NOT_APPLIED,
            HttpStatus.CONFLICT,
            { status: found.status },
          );
        const items = await tx.priceChangeItem.findMany({
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
        await tx.priceChange.update({
          where: { id: changeId },
          data: {
            status: PriceChangeStatus.ROLLED_BACK,
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
      { timeout: PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    await this.writer.afterCommitDue(locationId, done.dueApplied);
    await Promise.all([
      this.cache.invalidate(CacheDependency.pricing(locationId)),
      this.cache.invalidate(priceChangeCatalogCache(catalog, locationId)),
    ]);
    this.emit(catalog, changeId, locationId, actor, PRICE_CHANGE_AUDIT[catalog].rolledBack, {
      title: done.title,
      restoredCount: done.restoredCount,
      rollbackSkippedCount: done.rollbackSkippedCount,
    });
    return { restoredCount: done.restoredCount, currents: done.currents };
  }

  private async findInLocation(
    tx: Prisma.TransactionClient,
    locationId: string,
    catalog: PriceChangeCatalog,
    changeId: string,
  ) {
    const change = await tx.priceChange.findFirst({
      where: { id: changeId, locationId, catalog },
    });
    if (!change)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return change;
  }

  private emit(
    catalog: PriceChangeCatalog,
    changeId: string,
    locationId: string,
    actor: AuditActor,
    eventType: AuditEvent,
    payload: AuditLogEvent['payload'],
  ): void {
    const event: AuditLogEvent = {
      locationId,
      entityType: PRICE_CHANGE_AUDIT[catalog].entity,
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
