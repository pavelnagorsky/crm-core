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
import { LocationService } from '../../location/services/location.service.js';
import { SERVICE_PRICE_CHANGE_MAX_SCHEDULED } from '../constants/service-price-change.constants.js';
import { ServicePriceChangeMode } from '../enums/service-price-change-mode.enum.js';
import { PriceChangeConflict } from '../interfaces/price-change-conflict.interface.js';
import { ServicePriceChangeApplied } from '../interfaces/service-price-change-applied.interface.js';
import { ServicePriceChangeItemDraft } from '../interfaces/service-price-change-item-draft.interface.js';
import { ServicePriceChangeWriteInput } from '../interfaces/service-price-change-write-input.interface.js';
import { ServicePriceChangeWriteResult } from '../interfaces/service-price-change-write-result.interface.js';
import {
  importChangeTitle,
  ruleChangeTitle,
} from '../rules/service-price-change-title.rules.js';
import {
  PRICE_CHANGE_SYSTEM_ACTOR,
  ServicePriceChangeApplier,
} from './service-price-change-applier.service.js';

export type { ServicePriceChangeItemDraft };

const sameDecimal = (a: Prisma.Decimal | null, b: Prisma.Decimal | null) =>
  a === null || b === null ? a === b : a.equals(b);

/**
 * Stores a new price change: checks the date conflicts and the limit, writes it, and applies
 * it at once when it has no date. Shared by the rule dialog and the Excel upload. `write`
 * runs inside the caller's transaction after the location lock and `applyDue`;
 * `afterCommit` does the cache and audit work once it has committed.
 */
@Injectable()
export class ServicePriceChangeWriter {
  constructor(
    private readonly db: DatabaseService,
    private readonly applier: ServicePriceChangeApplier,
    private readonly locations: LocationService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * SCHEDULED changes on the date that touch one of the services or bundles; the ids in each
   * conflict are the ones both touch.
   */
  async findConflicts(
    db: Prisma.TransactionClient,
    locationId: string,
    effectiveDate: string,
    serviceIds: readonly string[],
    bundleIds: readonly string[],
  ): Promise<PriceChangeConflict[]> {
    if (serviceIds.length === 0 && bundleIds.length === 0) return [];
    const targets = {
      OR: [
        { serviceId: { in: [...serviceIds] } },
        { bundleId: { in: [...bundleIds] } },
      ],
    };
    const changes = await db.servicePriceChange.findMany({
      where: {
        locationId,
        status: ServicePriceChangeStatus.SCHEDULED,
        effectiveDate: TimeUtils.dateOnly(effectiveDate),
        items: { some: targets },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        effectiveDate: true,
        items: {
          where: targets,
          select: { serviceId: true, bundleId: true },
        },
      },
    });
    return changes.map((change) => ({
      changeId: change.id,
      title: change.title,
      effectiveDate: TimeUtils.dateOnlyStr(change.effectiveDate),
      serviceIds: [
        ...new Set(change.items.flatMap((i) => (i.serviceId ? [i.serviceId] : []))),
      ],
      bundleIds: [
        ...new Set(change.items.flatMap((i) => (i.bundleId ? [i.bundleId] : []))),
      ],
    }));
  }

  /**
   * Writes the change. Rows that end at their old price are dropped; none left gives null.
   * 409 SERVICE_PRICE_CHANGE_DATE_CONFLICT / SERVICE_PRICE_CHANGE_LIMIT for a dated change.
   */
  async write(
    tx: Prisma.TransactionClient,
    input: ServicePriceChangeWriteInput,
  ): Promise<ServicePriceChangeWriteResult | null> {
    const items = input.items.filter(
      (item) => !sameDecimal(item.beforePrice, item.afterPrice),
    );
    if (items.length === 0) return null;
    const serviceIds = [
      ...new Set(items.flatMap((item) => (item.serviceId ? [item.serviceId] : []))),
    ];
    const bundleIds = [
      ...new Set(items.flatMap((item) => (item.bundleId ? [item.bundleId] : []))),
    ];
    const { timezone, currency } = await this.locations.getLocale(
      input.locationId,
    );
    const today = TimeUtils.zonedDateStr(input.now, timezone);
    if (input.effectiveDate !== null) {
      const [conflict] = await this.findConflicts(
        tx,
        input.locationId,
        input.effectiveDate,
        serviceIds,
        bundleIds,
      );
      if (conflict)
        throw new AppException(
          ErrorCode.SERVICE_PRICE_CHANGE_DATE_CONFLICT,
          HttpStatus.CONFLICT,
          conflict,
        );
      const scheduled = await tx.servicePriceChange.count({
        where: {
          locationId: input.locationId,
          status: ServicePriceChangeStatus.SCHEDULED,
        },
      });
      if (scheduled >= SERVICE_PRICE_CHANGE_MAX_SCHEDULED)
        throw new AppException(
          ErrorCode.SERVICE_PRICE_CHANGE_LIMIT,
          HttpStatus.CONFLICT,
          { max: SERVICE_PRICE_CHANGE_MAX_SCHEDULED },
        );
    }
    const change = await tx.servicePriceChange.create({
      data: {
        locationId: input.locationId,
        source: input.source,
        status: ServicePriceChangeStatus.SCHEDULED,
        effectiveDate: TimeUtils.dateOnly(input.effectiveDate ?? today),
        title: this.title(input, currency),
        ruleSpec: input.ruleSpec ?? Prisma.JsonNull,
        fileName: input.fileName,
        servicesCount: serviceIds.length,
        bundlesCount: bundleIds.length,
        itemsCount: items.length,
        createdServicesCount: input.createdServicesCount,
        createdById: input.actor.id ?? null,
        items: { create: items },
      },
      select: { id: true },
    });
    const applied = input.effectiveDate === null;
    if (applied) await this.applier.apply(tx, change.id, input.now);
    return {
      changeId: change.id,
      applied,
      dueApplied: this.applier.takeDueApplied(tx),
    };
  }

  /**
   * After commit: drops the caches and logs the change. `auditEvent` is the creation event
   * for the change: SERVICE_PRICE_CHANGE_CREATED (default, logged only for a dated change) or
   * SERVICE_PRICES_IMPORTED (always). An applied change also logs SERVICE_PRICE_CHANGE_APPLIED.
   */
  async afterCommit(
    locationId: string,
    result: ServicePriceChangeWriteResult,
    actor: AuditActor,
    auditEvent: AuditEvent = AuditEvent.SERVICE_PRICE_CHANGE_CREATED,
  ): Promise<void> {
    await this.afterCommitDue(locationId, result.dueApplied ?? []);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    if (result.applied)
      await this.cache.invalidate(CacheDependency.serviceCatalog(locationId));
    const change = await this.db.servicePriceChange.findUnique({
      where: { id: result.changeId },
    });
    if (!change) return;
    const effectiveDate = TimeUtils.dateOnlyStr(change.effectiveDate);
    if (auditEvent === AuditEvent.SERVICE_PRICES_IMPORTED)
      this.emit(change.id, locationId, actor, auditEvent, {
        title: change.title,
        fileName: change.fileName ?? '',
        effectiveDate: result.applied ? null : effectiveDate,
        itemsCount: change.itemsCount,
        createdServicesCount: change.createdServicesCount,
      });
    else if (!result.applied)
      this.emit(change.id, locationId, actor, auditEvent, {
        title: change.title,
        effectiveDate,
        servicesCount: change.servicesCount,
        bundlesCount: change.bundlesCount,
      });
    if (result.applied)
      await this.applier.announce(
        {
          changeId: change.id,
          locationId,
          title: change.title,
          appliedCount: change.itemsCount - change.applySkippedCount,
          applySkippedCount: change.applySkippedCount,
        },
        actor,
      );
  }

  /**
   * After commit, for the changes `applyDue` applied in the caller's transaction when `write`
   * gave null (nothing to store): drops the caches and logs them as made by the system.
   */
  async afterCommitDue(
    locationId: string,
    dueApplied: readonly ServicePriceChangeApplied[],
  ): Promise<void> {
    if (dueApplied.length === 0) return;
    for (const applied of dueApplied)
      await this.applier.announce(applied, PRICE_CHANGE_SYSTEM_ACTOR);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
  }

  private title(
    input: ServicePriceChangeWriteInput,
    currency: string,
  ): string {
    if (input.source === ServicePriceChangeSource.IMPORT)
      return importChangeTitle(input.fileName ?? '');
    const spec = input.ruleSpec as {
      mode: ServicePriceChangeMode;
      value: string | null;
      priceRoundingStep: string;
    };
    return ruleChangeTitle(
      {
        mode: spec.mode,
        value: spec.value === null ? null : MoneyUtils.toMinor(spec.value),
        step: MoneyUtils.toMinor(spec.priceRoundingStep),
      },
      currency,
    );
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
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
