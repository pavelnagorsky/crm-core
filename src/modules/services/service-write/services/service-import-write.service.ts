import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ServiceStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppCacheService } from '../../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../../shared/cache/cache-dependency.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ServiceCategoriesService } from '../../categories/services/service-categories.service.js';
import { ImportedCatalogCreation } from '../interfaces/imported-catalog-creation.interface.js';
import { ImportedServiceInput } from '../interfaces/imported-service-input.interface.js';

/** Creates services and categories from a price file inside the transaction of the caller. */
@Injectable()
export class ServiceImportWriteService {
  private readonly logger = new Logger(ServiceImportWriteService.name);

  constructor(
    private readonly categories: ServiceCategoriesService,
    private readonly locationService: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: AppCacheService,
  ) {}

  /**
   * Creates the missing categories (by exact name) and the services: ACTIVE, no buffer, sort
   * order after the last of the category. No staff are assigned.
   */
  async create(
    tx: Prisma.TransactionClient,
    locationId: string,
    inputs: readonly ImportedServiceInput[],
  ): Promise<ImportedCatalogCreation> {
    const names = [
      ...new Set(inputs.flatMap((input) => input.categoryName ?? [])),
    ];
    const { categoryByName, created } = await this.categories.resolveByNames(
      tx,
      locationId,
      names,
    );

    const lastOrders = await tx.service.groupBy({
      by: ['categoryId'],
      where: { locationId },
      _max: { sortOrder: true },
    });
    const nextOrder = new Map(
      lastOrders.map((row) => [row.categoryId, (row._max.sortOrder ?? -1) + 1]),
    );
    const rows = inputs.map((input) => {
      const categoryId = input.categoryName
        ? (categoryByName.get(input.categoryName)?.id ?? null)
        : null;
      const sortOrder = nextOrder.get(categoryId) ?? 0;
      nextOrder.set(categoryId, sortOrder + 1);
      return {
        id: randomUUID(),
        locationId,
        categoryId,
        title: input.title,
        description: input.description,
        price: input.price,
        durationMinutes: input.durationMinutes,
        bufferMinutes: 0,
        status: ServiceStatus.ACTIVE,
        sortOrder,
      };
    });
    const services = rows.length
      ? await tx.service.createManyAndReturn({ data: rows })
      : [];
    const byId = new Map(services.map((service) => [service.id, service]));
    return {
      categories: created,
      services: rows.map((row, index) => ({
        service: byId.get(row.id)!,
        categoryName: inputs[index].categoryName,
      })),
    };
  }

  /** Cache reset and audit events; call after the transaction has committed. */
  async afterCommit(
    locationId: string,
    creation: ImportedCatalogCreation,
    actor: AuditActor,
  ): Promise<void> {
    if (creation.categories.length === 0 && creation.services.length === 0)
      return;
    await this.cache.invalidate(CacheDependency.serviceCatalog(locationId));
    const { currency } = await this.locationService.getLocale(locationId);
    const occurredAt = new Date();
    for (const category of creation.categories) {
      this.emit({
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: category.id,
        eventType: AuditEvent.SERVICE_CATEGORY_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt,
        actor,
        payload: { name: category.name },
      });
    }
    for (const { service, categoryName } of creation.services) {
      this.logger.log(
        `service created from import: id=${service.id} locationId=${locationId}`,
      );
      this.emit({
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: service.id,
        eventType: AuditEvent.SERVICE_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt,
        actor,
        payload: {
          title: service.title,
          price: service.price.toString(),
          durationMinutes: service.durationMinutes,
          currency,
          ...(categoryName ? { categoryName } : {}),
        },
      });
    }
  }

  private emit(event: AuditLogEvent): void {
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
