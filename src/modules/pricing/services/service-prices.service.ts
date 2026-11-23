import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { ServicePricesUpdatedPayload } from '../../audit/interfaces/service-prices-updated-payload.interface.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { SetServiceLevelPricesDto } from '../dto/set-service-level-prices.dto.js';
import { SetServiceStaffPricesDto } from '../dto/set-service-staff-prices.dto.js';
import { SetStaffServicePricesDto } from '../dto/set-staff-service-prices.dto.js';
import { ServicePricesView } from '../interfaces/service-prices-view.interface.js';
import { StaffServicePricesView } from '../interfaces/staff-service-prices-view.interface.js';
import { priceChanges } from '../rules/price-audit.rules.js';
import {
  buildServicePricesView,
  buildStaffServicePricesView,
} from '../rules/service-prices.rules.js';
import { PriceLevelReadService } from './price-level-read.service.js';
import { PriceLevelsService } from './price-levels.service.js';

/** Cabinet price cards: the prices of one service and the personal prices of one staff member. */
@Injectable()
export class ServicePricesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly levels: PriceLevelReadService,
    private readonly levelsWrite: PriceLevelsService,
    private readonly staff: StaffService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly cache: AppCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getServicePrices(
    locationId: string,
    serviceId: string,
  ): Promise<ServicePricesView> {
    const service = await this.catalog.findServiceById(locationId, serviceId);
    const [levels, levelPrices, staffRows, staffCounts] = await Promise.all([
      this.levels.listLevels(locationId),
      this.levels.listLevelPricesForService(serviceId),
      this.staff.listServicePriceRows(locationId, serviceId),
      this.staff.countByPriceLevel(locationId),
    ]);
    return buildServicePricesView({
      serviceId,
      basePrice: service.price,
      levels,
      levelPrices,
      staffRows,
      staffCounts,
    });
  }

  async setLevelPrices(
    locationId: string,
    serviceId: string,
    dto: SetServiceLevelPricesDto,
    actor: AuditActor,
  ): Promise<ServicePricesView> {
    const service = await this.catalog.findServiceById(locationId, serviceId);
    const { before, names } = await this.db.$transaction((tx) =>
      this.levelsWrite.setServiceLevelPrices(
        locationId,
        serviceId,
        dto.items,
        tx,
      ),
    );
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const levelChanges = priceChanges(
      names,
      before,
      new Map(dto.items.map((item) => [item.levelId, item.price])),
    );
    if (levelChanges.length > 0)
      this.emitServicePrices(locationId, serviceId, actor, {
        title: service.title,
        levelChanges,
      });
    return this.getServicePrices(locationId, serviceId);
  }

  async setStaffPrices(
    locationId: string,
    serviceId: string,
    dto: SetServiceStaffPricesDto,
    actor: AuditActor,
  ): Promise<ServicePricesView> {
    const service = await this.catalog.findServiceById(locationId, serviceId);
    const rows = await this.staff.listServicePriceRows(locationId, serviceId);
    const prices = new Map(dto.items.map((item) => [item.staffId, item.price]));
    const before = await this.db.$transaction((tx) =>
      this.staff.setPricesForService(locationId, serviceId, prices, tx),
    );
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const staffChanges = priceChanges(
      new Map(rows.map(({ staff }) => [staff.id, staff.name])),
      before,
      prices,
    );
    if (staffChanges.length > 0)
      this.emitServicePrices(locationId, serviceId, actor, {
        title: service.title,
        staffChanges,
      });
    return this.getServicePrices(locationId, serviceId);
  }

  async getStaffServicePrices(
    locationId: string,
    staffId: string,
  ): Promise<StaffServicePricesView> {
    const profile = await this.staff.readServicePrices(locationId, staffId);
    const serviceIds = profile.items.map((item) => item.serviceId);
    const [services, levelPrices] = await Promise.all([
      this.catalog.findServicePriceEntries(locationId, serviceIds),
      profile.priceLevelId
        ? this.levels.listLevelPricesOfLevel(profile.priceLevelId, serviceIds)
        : Promise.resolve([]),
    ]);
    return buildStaffServicePricesView({
      staffId,
      levelId: profile.priceLevelId,
      services,
      levelPrices,
      personalPrices: new Map(
        profile.items.map((item) => [item.serviceId, item.personalPrice]),
      ),
    });
  }

  async setStaffServicePrices(
    locationId: string,
    staffId: string,
    dto: SetStaffServicePricesDto,
    actor: AuditActor,
  ): Promise<StaffServicePricesView> {
    const prices = new Map(
      dto.items.map((item) => [item.serviceId, item.price]),
    );
    const before = await this.db.$transaction((tx) =>
      this.staff.setServicePrices(locationId, staffId, prices, tx),
    );
    await this.cache.invalidate(CacheDependency.pricing(locationId));
    const [services, staffName] = await Promise.all([
      this.catalog.findServicePriceEntries(locationId, [...prices.keys()]),
      this.staff.namesByIds([staffId]),
    ]);
    const changes = priceChanges(
      new Map(services.map((service) => [service.id, service.title])),
      before,
      prices,
    );
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.STAFF,
        entityId: staffId,
        eventType: AuditEvent.STAFF_PRICES_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { title: staffName.get(staffId) ?? staffId, changes },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return this.getStaffServicePrices(locationId, staffId);
  }

  private emitServicePrices(
    locationId: string,
    serviceId: string,
    actor: AuditActor,
    payload: ServicePricesUpdatedPayload,
  ): void {
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: serviceId,
      eventType: AuditEvent.SERVICE_PRICES_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload,
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
