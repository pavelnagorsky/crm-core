import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeSource,
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
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { PRICE_CHANGE_AUDIT } from '../constants/price-change-audit.constants.js';
import { PRICE_CHANGE_MAX_SCHEDULED } from '../constants/price-change.constants.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { PriceChangeApplied } from '../interfaces/price-change-applied.interface.js';
import { PriceChangeConflict } from '../interfaces/price-change-conflict.interface.js';
import { PriceChangeItemDraft } from '../interfaces/price-change-item-draft.interface.js';
import { PriceChangeTargetIds } from '../interfaces/price-change-target-ids.interface.js';
import { PriceChangeWriteInput } from '../interfaces/price-change-write-input.interface.js';
import { PriceChangeWriteResult } from '../interfaces/price-change-write-result.interface.js';
import { priceChangeCatalogCache } from '../rules/price-change-cache.rules.js';
import {
  importChangeTitle,
  ruleChangeTitle,
} from '../rules/service-price-change-title.rules.js';
import {
  PRICE_CHANGE_SYSTEM_ACTOR,
  PriceChangeApplier,
} from './price-change-applier.service.js';

export type { PriceChangeItemDraft };

const sameDecimal = (a: Prisma.Decimal | null, b: Prisma.Decimal | null) =>
  a === null || b === null ? a === b : a.equals(b);
const distinct = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.flatMap((id) => (id ? [id] : []))),
];

/**
 * Stores a new price change of either catalog: checks the date conflicts and the limit,
 * writes it, and applies it at once when it has no date. Shared by the rule dialogs and the
 * Excel uploads of services and products. `write` runs inside the caller's transaction after
 * the location lock and `applyDue`; `afterCommit` does the cache and audit work once it has
 * committed.
 */
@Injectable()
export class PriceChangeWriter {
  constructor(
    private readonly db: DatabaseService,
    private readonly applier: PriceChangeApplier,
    private readonly locations: LocationService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * SCHEDULED changes on the date that touch one of the targets; the ids in each conflict
   * are the ones both touch. Product rows are matched by `ProductLocation.id` and reported by
   * `Product.id` (`targets.productIds`).
   */
  async findConflicts(
    db: Prisma.TransactionClient,
    locationId: string,
    effectiveDate: string,
    targets: PriceChangeTargetIds,
  ): Promise<PriceChangeConflict[]> {
    const serviceIds = targets.serviceIds ?? [];
    const bundleIds = targets.bundleIds ?? [];
    const productLocationIds = [...(targets.productIds?.keys() ?? [])];
    const or: Prisma.PriceChangeItemWhereInput[] = [
      ...(serviceIds.length > 0 ? [{ serviceId: { in: [...serviceIds] } }] : []),
      ...(bundleIds.length > 0 ? [{ bundleId: { in: [...bundleIds] } }] : []),
      ...(productLocationIds.length > 0
        ? [{ productLocationId: { in: productLocationIds } }]
        : []),
    ];
    if (or.length === 0) return [];
    const where: Prisma.PriceChangeItemWhereInput = { OR: or };
    const changes = await db.priceChange.findMany({
      where: {
        locationId,
        status: PriceChangeStatus.SCHEDULED,
        effectiveDate: TimeUtils.dateOnly(effectiveDate),
        items: { some: where },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        effectiveDate: true,
        items: {
          where,
          select: { serviceId: true, bundleId: true, productLocationId: true },
        },
      },
    });
    return changes.map((change) => ({
      changeId: change.id,
      title: change.title,
      effectiveDate: TimeUtils.dateOnlyStr(change.effectiveDate),
      serviceIds: distinct(change.items.map((i) => i.serviceId)),
      bundleIds: distinct(change.items.map((i) => i.bundleId)),
      productIds: distinct(
        change.items.map((i) =>
          i.productLocationId
            ? (targets.productIds?.get(i.productLocationId) ?? null)
            : null,
        ),
      ),
    }));
  }

  /**
   * Writes the change. Rows that end at their old price are dropped; none left gives null.
   * 409 PRICE_CHANGE_DATE_CONFLICT / PRICE_CHANGE_LIMIT (per catalog) for a dated change.
   */
  async write(
    tx: Prisma.TransactionClient,
    input: PriceChangeWriteInput,
  ): Promise<PriceChangeWriteResult | null> {
    const items = input.items.filter(
      (item) => !sameDecimal(item.beforePrice, item.afterPrice),
    );
    if (items.length === 0) return null;
    const serviceIds = distinct(items.map((item) => item.serviceId));
    const bundleIds = distinct(items.map((item) => item.bundleId));
    const productLocationIds = distinct(
      items.map((item) => item.productLocationId),
    );
    const { timezone, currency } = await this.locations.getLocale(
      input.locationId,
    );
    const today = TimeUtils.zonedDateStr(input.now, timezone);
    if (input.effectiveDate !== null) {
      const productIds = new Map(
        productLocationIds.map((id) => [id, input.productIds?.get(id) ?? id]),
      );
      const [conflict] = await this.findConflicts(
        tx,
        input.locationId,
        input.effectiveDate,
        { serviceIds, bundleIds, productIds },
      );
      if (conflict)
        throw new AppException(
          ErrorCode.PRICE_CHANGE_DATE_CONFLICT,
          HttpStatus.CONFLICT,
          conflict,
        );
      const scheduled = await tx.priceChange.count({
        where: {
          locationId: input.locationId,
          catalog: input.catalog,
          status: PriceChangeStatus.SCHEDULED,
        },
      });
      if (scheduled >= PRICE_CHANGE_MAX_SCHEDULED)
        throw new AppException(
          ErrorCode.PRICE_CHANGE_LIMIT,
          HttpStatus.CONFLICT,
          { max: PRICE_CHANGE_MAX_SCHEDULED },
        );
    }
    const change = await tx.priceChange.create({
      data: {
        locationId: input.locationId,
        catalog: input.catalog,
        source: input.source,
        status: PriceChangeStatus.SCHEDULED,
        effectiveDate: TimeUtils.dateOnly(input.effectiveDate ?? today),
        title: this.title(input, currency),
        ruleSpec: input.ruleSpec ?? Prisma.JsonNull,
        fileName: input.fileName,
        servicesCount: serviceIds.length,
        bundlesCount: bundleIds.length,
        productsCount: productLocationIds.length,
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
   * After commit: drops the caches and logs the change. A rule change logs the catalog's
   * CREATED event when it has a date; an upload (`imported`) always logs the catalog's
   * PRICES_IMPORTED event. An applied change also logs the catalog's APPLIED event.
   */
  async afterCommit(
    locationId: string,
    result: PriceChangeWriteResult,
    actor: AuditActor,
    imported = false,
  ): Promise<void> {
    await this.afterCommitDue(locationId, result.dueApplied ?? []);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const change = await this.db.priceChange.findUnique({
      where: { id: result.changeId },
    });
    if (!change) return;
    if (result.applied)
      await this.cache.invalidate(
        priceChangeCatalogCache(change.catalog, locationId),
      );
    const audit = PRICE_CHANGE_AUDIT[change.catalog];
    const products = change.catalog === PriceChangeCatalog.PRODUCTS;
    const effectiveDate = TimeUtils.dateOnlyStr(change.effectiveDate);
    if (imported)
      this.emit(audit.entity, change.id, locationId, actor, audit.imported, {
        title: change.title,
        fileName: change.fileName ?? '',
        effectiveDate: result.applied ? null : effectiveDate,
        itemsCount: change.itemsCount,
        ...(products
          ? {}
          : { createdServicesCount: change.createdServicesCount }),
      });
    else if (!result.applied)
      this.emit(audit.entity, change.id, locationId, actor, audit.created, {
        title: change.title,
        effectiveDate,
        ...(products
          ? { productsCount: change.productsCount }
          : {
              servicesCount: change.servicesCount,
              bundlesCount: change.bundlesCount,
            }),
      });
    if (result.applied)
      await this.applier.announce(
        {
          changeId: change.id,
          locationId,
          catalog: change.catalog,
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
    dueApplied: readonly PriceChangeApplied[],
  ): Promise<void> {
    if (dueApplied.length === 0) return;
    for (const applied of dueApplied)
      await this.applier.announce(applied, PRICE_CHANGE_SYSTEM_ACTOR);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
  }

  private title(input: PriceChangeWriteInput, currency: string): string {
    if (input.source === PriceChangeSource.IMPORT)
      return importChangeTitle(input.fileName ?? '');
    const spec = input.ruleSpec as {
      mode: PriceChangeMode;
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
    entityType: AuditEntity,
    changeId: string,
    locationId: string,
    actor: AuditActor,
    eventType: AuditEvent,
    payload: AuditLogEvent['payload'],
  ): void {
    const event: AuditLogEvent = {
      locationId,
      entityType,
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
