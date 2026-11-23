import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PriceLevel, ServiceStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import {
  PRICE_FILL_MAX_PERCENT_BP,
  PRICE_FILL_MIN_PERCENT_BP,
  PRICE_MAX_MINOR,
} from '../constants/price-level-fill.constants.js';
import { PriceLevelFillApplyRequestDto } from '../dto/price-level-fill-apply-request.dto.js';
import { PriceLevelFillRequestDto } from '../dto/price-level-fill-request.dto.js';
import { PriceLevelFillMode } from '../enums/price-level-fill-mode.enum.js';
import { BulkFillItem } from '../interfaces/bulk-fill-item.interface.js';
import { PriceLevelFillSpec } from '../interfaces/price-level-fill-spec.interface.js';
import { levelFillPrice } from '../rules/price-level-fill.rules.js';
import { PriceLevelReadService } from './price-level-read.service.js';
import { PriceLevelsService } from './price-levels.service.js';

/**
 * Fills the prices of one non-default level from the base prices of many services at once:
 * base plus or minus a percent or an amount, rounded to the nearest step, or cleared. The
 * preview and the apply compute the same rows; the apply recomputes them, so the client
 * cannot send prices.
 */
@Injectable()
export class PriceLevelFillService {
  constructor(
    private readonly db: DatabaseService,
    private readonly levels: PriceLevelReadService,
    private readonly levelsWrite: PriceLevelsService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Services of the chosen categories with the price the fill would give each. */
  async preview(
    locationId: string,
    levelId: string,
    dto: PriceLevelFillRequestDto,
  ): Promise<BulkFillItem[]> {
    const { items } = await this.compute(
      locationId,
      levelId,
      dto,
      ReadConsistency.CACHED,
    );
    return items;
  }

  /**
   * Writes the new prices of the selected services in one transaction and returns how many
   * changed. 400 PRICE_LEVEL_FILL_INVALID when a selected row comes out at zero or below.
   */
  async apply(
    locationId: string,
    levelId: string,
    dto: PriceLevelFillApplyRequestDto,
    actor: AuditActor,
  ): Promise<number> {
    const { level, items } = await this.compute(
      locationId,
      levelId,
      dto,
      ReadConsistency.FRESH,
    );
    const byService = new Map(items.map((item) => [item.serviceId, item]));
    const selected = [...new Set(dto.serviceIds)].map((serviceId) => {
      const item = byService.get(serviceId);
      if (!item) throw new NotFoundException('Service not found');
      return item;
    });
    if (selected.some((item) => item.invalid))
      throw new AppException(
        ErrorCode.PRICE_LEVEL_FILL_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    const changed = selected.filter((item) =>
      item.newPrice === null
        ? item.currentPrice !== null
        : item.currentPrice === null || !item.newPrice.equals(item.currentPrice),
    );
    if (changed.length === 0) return 0;
    await this.db.$transaction((tx) =>
      this.levelsWrite.writeLevelPrices(
        levelId,
        changed.map((item) => ({
          serviceId: item.serviceId,
          price: item.newPrice,
        })),
        tx,
      ),
    );
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.PRICE_LEVEL,
      entityId: levelId,
      eventType: AuditEvent.LEVEL_PRICES_FILLED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: { name: level.name, updated: changed.length },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return changed.length;
  }

  private async compute(
    locationId: string,
    levelId: string,
    dto: PriceLevelFillRequestDto,
    consistency: ReadConsistency,
  ): Promise<{ level: PriceLevel; items: BulkFillItem[] }> {
    const level = await this.levels.findLevel(locationId, levelId);
    if (level.isDefault)
      throw new AppException(
        ErrorCode.PRICE_LEVEL_DEFAULT_PRICE,
        HttpStatus.BAD_REQUEST,
      );
    const spec = fillSpec(dto);
    const catalog = await this.serviceCatalog.loadCatalogSnapshot(
      locationId,
      consistency,
    );
    const categoryIds = new Set(dto.categoryIds);
    const categories = new Map(
      catalog.categories.map((category, index) => [
        category.id,
        { name: category.name, order: index },
      ]),
    );
    const services = catalog.services
      .filter(
        (service) =>
          service.status === ServiceStatus.ACTIVE &&
          (categoryIds.size === 0 ||
            (service.categoryId !== null &&
              categoryIds.has(service.categoryId))),
      )
      .sort(
        (a, b) =>
          (categories.get(a.categoryId ?? '')?.order ?? Infinity) -
            (categories.get(b.categoryId ?? '')?.order ?? Infinity) ||
          a.sortOrder - b.sortOrder ||
          a.title.localeCompare(b.title),
      );
    const current = new Map(
      (
        await this.levels.listLevelPricesOfLevel(
          levelId,
          services.map((service) => service.id),
        )
      ).map((row) => [row.serviceId, row.price]),
    );
    const items = services.map((service): BulkFillItem => {
      const currentPrice = current.get(service.id) ?? null;
      const { price, invalid } = levelFillPrice(
        MoneyUtils.toMinor(service.price),
        spec,
      );
      return {
        serviceId: service.id,
        title: service.title,
        categoryName: categories.get(service.categoryId ?? '')?.name ?? null,
        basePrice: service.price,
        currentPrice,
        newPrice: price === null ? null : MoneyUtils.fromMinor(price),
        checked: currentPrice === null,
        invalid,
      };
    });
    return { level, items };
  }
}

/** Parses and bounds the fill: percent -99..1000, amount within the price column. */
function fillSpec(dto: PriceLevelFillRequestDto): PriceLevelFillSpec {
  const step = MoneyUtils.toMinor(dto.priceRoundingStep);
  if (dto.mode === PriceLevelFillMode.BASE)
    return { mode: dto.mode, value: 0, step };
  if (dto.value === undefined)
    throw new BadRequestException('value is required');
  const value = MoneyUtils.toMinor(dto.value);
  const inRange =
    dto.mode === PriceLevelFillMode.PERCENT
      ? value >= PRICE_FILL_MIN_PERCENT_BP && value <= PRICE_FILL_MAX_PERCENT_BP
      : Math.abs(value) <= PRICE_MAX_MINOR;
  if (!inRange) throw new BadRequestException('value is out of range');
  return { mode: dto.mode, value, step };
}
