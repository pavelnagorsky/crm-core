import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ServicePriceChangeStatus } from '@prisma/client';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { PriceChangeItemMark } from '../interfaces/price-change-item-mark.interface.js';
import { PriceChangeWrite } from '../interfaces/price-change-write.interface.js';
import { ServicePriceChangeApplied } from '../interfaces/service-price-change-applied.interface.js';
import { applyDecision } from '../rules/service-price-change-apply.rules.js';
import { ServicePriceChangeStore } from './service-price-change-store.service.js';

/** The actor of changes that come into force by the schedule. */
export const PRICE_CHANGE_SYSTEM_ACTOR: AuditActor = {
  name: 'Система',
  role: AuditActorRole.SYSTEM,
};

/**
 * Moves a scheduled change into the stored prices. Always runs inside a transaction that
 * holds the location lock (`ServicePriceChangeLock`).
 */
@Injectable()
export class ServicePriceChangeApplier {
  /** Changes applied by `applyDue` in a transaction, until `takeDueApplied` hands them out. */
  private readonly dueByTx = new WeakMap<
    Prisma.TransactionClient,
    ServicePriceChangeApplied[]
  >();

  constructor(
    private readonly store: ServicePriceChangeStore,
    private readonly locations: LocationService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Applies one change: idempotent, a change that is no longer SCHEDULED gives null. Rows
   * whose target is gone or cannot take the price are skipped with the reason; "before"
   * becomes the price actually stored.
   */
  async apply(
    tx: Prisma.TransactionClient,
    changeId: string,
    now: Date,
  ): Promise<ServicePriceChangeApplied | null> {
    const claimed = await tx.servicePriceChange.updateMany({
      where: { id: changeId, status: ServicePriceChangeStatus.SCHEDULED },
      data: { status: ServicePriceChangeStatus.APPLIED, appliedAt: now },
    });
    if (claimed.count === 0) return null;
    const change = await tx.servicePriceChange.findUniqueOrThrow({
      where: { id: changeId },
      include: { items: true },
    });
    const states = await this.store.loadStates(tx, change.items);
    const writes: PriceChangeWrite[] = [];
    const marks: PriceChangeItemMark[] = [];
    for (const item of change.items) {
      const state = states.get(item.id)!;
      const decision = applyDecision(state);
      marks.push({
        itemId: item.id,
        before: state.current,
        skip: decision.skip,
        rolledBack: false,
      });
      if (decision.write)
        writes.push({
          itemId: item.id,
          price:
            item.afterPrice === null ? null : MoneyUtils.toMinor(item.afterPrice),
        });
    }
    await this.store.writePrices(
      tx,
      new Map(change.items.map((item) => [item.id, item])),
      writes,
    );
    await this.store.markApplied(tx, marks);
    const applySkippedCount = marks.length - writes.length;
    await tx.servicePriceChange.update({
      where: { id: changeId },
      data: { applySkippedCount },
    });
    return {
      changeId,
      locationId: change.locationId,
      title: change.title,
      appliedCount: writes.length,
      applySkippedCount,
    };
  }

  /**
   * Applies the SCHEDULED changes of the location whose date has come (location today or
   * earlier), oldest first. The applied ones are kept for `takeDueApplied`.
   */
  async applyDue(
    tx: Prisma.TransactionClient,
    locationId: string,
    now: Date,
  ): Promise<void> {
    const { timezone } = await this.locations.getLocale(locationId, tx);
    const today = TimeUtils.zonedDateStr(now, timezone);
    const due = await tx.servicePriceChange.findMany({
      where: {
        locationId,
        status: ServicePriceChangeStatus.SCHEDULED,
        effectiveDate: { lte: TimeUtils.dateOnly(today) },
      },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    for (const { id } of due) {
      const applied = await this.apply(tx, id, now);
      if (applied)
        this.dueByTx.set(tx, [...(this.dueByTx.get(tx) ?? []), applied]);
    }
  }

  /** The changes `applyDue` applied in this transaction; call after commit and announce them. */
  takeDueApplied(tx: Prisma.TransactionClient): ServicePriceChangeApplied[] {
    const applied = this.dueByTx.get(tx) ?? [];
    this.dueByTx.delete(tx);
    return applied;
  }

  /** After commit: drops the price caches and logs that the change came into force. */
  async announce(
    applied: ServicePriceChangeApplied,
    actor: AuditActor,
  ): Promise<void> {
    await Promise.all([
      this.cache.invalidate(CacheDependency.pricing(applied.locationId)),
      this.cache.invalidate(CacheDependency.serviceCatalog(applied.locationId)),
    ]);
    const event: AuditLogEvent = {
      locationId: applied.locationId,
      entityType: AuditEntity.SERVICE_PRICE_CHANGE,
      entityId: applied.changeId,
      eventType: AuditEvent.SERVICE_PRICE_CHANGE_APPLIED,
      actionType: AuditActionType.ACTION,
      occurredAt: new Date(),
      actor,
      payload: {
        title: applied.title,
        appliedCount: applied.appliedCount,
        applySkippedCount: applied.applySkippedCount,
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
