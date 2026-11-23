import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { PRICE_LEVEL_AUDIT_FIELDS } from '../../audit/fields/price-level.fields.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../audit/utils/diff-fields.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { CreatePriceLevelDto } from '../dto/create-price-level.dto.js';
import { ServiceLevelPriceItemDto } from '../dto/service-level-price-item.dto.js';
import { UpdatePriceLevelDto } from '../dto/update-price-level.dto.js';
import { PriceLevelView } from '../interfaces/price-level-view.interface.js';
import { PriceLevelReadService } from './price-level-read.service.js';

/** Cabinet operations on the price levels and the level prices, the tables the pricing module owns. */
@Injectable()
export class PriceLevelsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly levels: PriceLevelReadService,
    private readonly staff: StaffService,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Levels in display order with the staff on each; staff without a level count for the default one. */
  async list(locationId: string): Promise<PriceLevelView[]> {
    const [levels, counts] = await Promise.all([
      this.levels.listLevels(locationId),
      this.staff.countByPriceLevel(locationId),
    ]);
    return levels.map((level) => ({
      ...level,
      staffCount: countOfLevel(level, counts),
    }));
  }

  /** The first level of a location becomes the default one. */
  async create(
    locationId: string,
    dto: CreatePriceLevelDto,
    actor: AuditActor,
  ): Promise<PriceLevelView> {
    const level = await this.db
      .$transaction(async (tx) => {
        // Two first levels of one location must not both count zero existing levels.
        await lockLevels(tx, locationId);
        const existing = await tx.priceLevel.count({ where: { locationId } });
        return tx.priceLevel.create({
          data: {
            locationId,
            name: dto.name,
            sortOrder: dto.sortOrder ?? 0,
            isDefault: existing === 0,
          },
        });
      })
      .catch(rethrowNameExists);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    this.emit(locationId, level.id, actor, {
      eventType: AuditEvent.PRICE_LEVEL_CREATED,
      actionType: AuditActionType.CREATE,
      payload: { name: level.name, isDefault: level.isDefault },
    });
    return { ...level, staffCount: 0 };
  }

  /**
   * Making a level the default moves the flag in one transaction: the previous default level
   * loses it, and the prices of the new default level are deleted, since its price is now
   * the base price. Staff recorded on the new default level move to "no level".
   */
  async update(
    locationId: string,
    levelId: string,
    dto: UpdatePriceLevelDto,
    actor: AuditActor,
  ): Promise<PriceLevelView> {
    const before = await this.levels.findLevel(locationId, levelId);
    const makeDefault = dto.isDefault === true && !before.isDefault;
    const level = await this.db
      .$transaction(async (tx) => {
        if (makeDefault) {
          await lockLevels(tx, locationId);
          await tx.priceLevel.updateMany({
            where: { locationId, isDefault: true },
            data: { isDefault: false },
          });
          await tx.serviceLevelPrice.deleteMany({
            where: { priceLevelId: levelId },
          });
          await this.staff.resetPriceLevel(levelId, tx);
        }
        return tx.priceLevel.update({
          where: { id: levelId },
          data: {
            name: dto.name,
            sortOrder: dto.sortOrder,
            ...(makeDefault && { isDefault: true }),
          },
        });
      })
      .catch(rethrowNameExists);
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const changes = diffFields(before, level, PRICE_LEVEL_AUDIT_FIELDS);
    if (changes.length > 0)
      this.emit(locationId, levelId, actor, {
        eventType: AuditEvent.PRICE_LEVEL_UPDATED,
        actionType: AuditActionType.MODIFY,
        payload: { changes },
      });
    const counts = await this.staff.countByPriceLevel(locationId);
    return { ...level, staffCount: countOfLevel(level, counts) };
  }

  /**
   * The default level stays while other levels exist. The staff of a deleted level move to
   * "no level" (foreign key), its prices go with it (cascade).
   */
  async delete(
    locationId: string,
    levelId: string,
    actor: AuditActor,
  ): Promise<void> {
    // The check and the delete share the lock with create: a level added meanwhile is counted.
    const level = await this.db.$transaction(async (tx) => {
      await lockLevels(tx, locationId);
      const found = await tx.priceLevel.findFirst({
        where: { id: levelId, locationId },
      });
      if (!found)
        throw new AppException(
          ErrorCode.PRICE_LEVEL_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      if (found.isDefault) {
        const others = await tx.priceLevel.count({
          where: { locationId, id: { not: levelId } },
        });
        if (others > 0)
          throw new AppException(
            ErrorCode.PRICE_LEVEL_DEFAULT_IN_USE,
            HttpStatus.CONFLICT,
          );
      }
      await tx.priceLevel.delete({ where: { id: levelId } });
      return found;
    });
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    this.emit(locationId, levelId, actor, {
      eventType: AuditEvent.PRICE_LEVEL_DELETED,
      actionType: AuditActionType.DELETE,
      payload: { name: level.name },
    });
  }

  /**
   * Sets or, with null, resets the own prices of non-default levels for one service. The
   * default level has none (400). Returns the previous prices and the level names for audit.
   */
  async setServiceLevelPrices(
    locationId: string,
    serviceId: string,
    items: readonly ServiceLevelPriceItemDto[],
    tx: Prisma.TransactionClient,
  ): Promise<{
    before: Map<string, Prisma.Decimal | null>;
    names: Map<string, string>;
  }> {
    const levelIds = items.map((item) => item.levelId);
    const levels = await tx.priceLevel.findMany({
      where: { locationId, id: { in: levelIds } },
    });
    if (levels.length !== new Set(levelIds).size)
      throw new AppException(
        ErrorCode.PRICE_LEVEL_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (levels.some((level) => level.isDefault))
      throw new AppException(
        ErrorCode.PRICE_LEVEL_DEFAULT_PRICE,
        HttpStatus.BAD_REQUEST,
      );
    const rows = await tx.serviceLevelPrice.findMany({
      where: { serviceId, priceLevelId: { in: levelIds } },
    });
    for (const { levelId, price } of items) {
      if (price === null)
        await tx.serviceLevelPrice.deleteMany({
          where: { serviceId, priceLevelId: levelId },
        });
      else
        await tx.serviceLevelPrice.upsert({
          where: {
            serviceId_priceLevelId: { serviceId, priceLevelId: levelId },
          },
          create: { serviceId, priceLevelId: levelId, price },
          update: { price },
        });
    }
    return {
      before: new Map(rows.map((row) => [row.priceLevelId, row.price])),
      names: new Map(levels.map((level) => [level.id, level.name])),
    };
  }

  private emit(
    locationId: string,
    levelId: string,
    actor: AuditActor,
    event: Pick<AuditLogEvent, 'eventType' | 'actionType' | 'payload'>,
  ): void {
    const logEvent: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.PRICE_LEVEL,
      entityId: levelId,
      occurredAt: new Date(),
      actor,
      ...event,
    };
    this.eventEmitter.emit(AUDIT_EVENT, logEvent);
  }
}

/** Staff of a level; the staff without a level belong to the default one. */
function countOfLevel(
  level: { id: string; isDefault: boolean },
  counts: ReadonlyMap<string | null, number>,
): number {
  return (
    (counts.get(level.id) ?? 0) +
    (level.isDefault ? (counts.get(null) ?? 0) : 0)
  );
}

/** Serializes the level changes of one location until the transaction ends. */
async function lockLevels(
  tx: Prisma.TransactionClient,
  locationId: string,
): Promise<void> {
  const key = JSON.stringify(['price-levels', locationId]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

interface UniqueViolation {
  code?: string;
  message?: string;
  meta?: {
    target?: string[] | string;
    driverAdapterError?: {
      cause?: {
        originalMessage?: string;
        constraint?: { fields?: string[]; index?: string };
      };
    };
  };
}

/**
 * True for the unique (locationId, name) index only. The one-default-per-location index is
 * another violation and must not read as a taken name.
 */
function isNameViolation(error: UniqueViolation): boolean {
  const cause = error.meta?.driverAdapterError?.cause;
  const target =
    error.meta?.target ?? cause?.constraint?.fields ?? cause?.constraint?.index;
  if (target)
    return (Array.isArray(target) ? target : [target]).some((part) =>
      part.includes('name'),
    );
  return [cause?.originalMessage, error.message].some((text) =>
    text?.includes('PriceLevel_locationId_name_key'),
  );
}

function rethrowNameExists(error: unknown): never {
  const prismaError = error as UniqueViolation | null;
  if (
    prismaError?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION &&
    isNameViolation(prismaError)
  )
    throw new AppException(
      ErrorCode.PRICE_LEVEL_NAME_EXISTS,
      HttpStatus.CONFLICT,
    );
  throw error;
}
