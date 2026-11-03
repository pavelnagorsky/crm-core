import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../../database/database.service.js';
import { AppCacheService } from '../../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../../shared/cache/cache-dependency.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ServiceCategoriesService } from '../../../services/categories/services/service-categories.service.js';
import { ServiceWriteService } from '../../../services/service-write/services/service-write.service.js';
import { STARTER_CATALOG } from '../../../services/starter-catalog/constants/starter-catalog.constants.js';
import { StarterCategoryTemplate } from '../../../services/starter-catalog/interfaces/starter-category-template.interface.js';
import { StaffService } from '../../../staff/services/staff.service.js';

@Injectable()
export class BrandInitialDataService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly categories: ServiceCategoriesService,
    private readonly services: ServiceWriteService,
    private readonly staff: StaffService,
    private readonly cache: AppCacheService,
    private readonly events: EventEmitter2,
  ) {}

  async populate(
    locationId: string,
    userId: string,
    actor: AuditActor,
  ): Promise<void> {
    const result = await this.db.$transaction(async (tx) => {
      if (!(await this.locations.acquireActiveOperationLock(locationId, tx)))
        return null;
      const location = await this.locations.findById(locationId, tx);
      const template: readonly StarterCategoryTemplate[] =
        location.businessType == null
          ? []
          : STARTER_CATALOG[location.businessType];
      if (
        !template.every((category) =>
          category.services.every((service) =>
            Object.hasOwn(service.prices, location.currency),
          ),
        )
      ) {
        throw new Error(
          `Unsupported starter catalog currency: ${location.currency}`,
        );
      }
      const categories = template.length
        ? await this.categories.createStarterCategories(
            locationId,
            template.map((category) => category.name),
            tx,
          )
        : [];
      const categoryIds = new Map(
        categories.map((category) => [category.name, category.id]),
      );
      const services = template.length
        ? await this.services.createStarterServices(
            locationId,
            template.flatMap((category) =>
              category.services.map((service, sortOrder) => ({
                categoryId: categoryIds.get(category.name)!,
                title: service.title,
                durationMinutes: service.durationMinutes,
                price:
                  service.prices[
                    location.currency as keyof typeof service.prices
                  ],
                sortOrder,
              })),
            ),
            tx,
          )
        : [];
      const staff = await this.staff.createInitialOwner(
        locationId,
        userId,
        services.map((service) => service.id),
        tx,
      );
      return { location, categories, services, staff };
    });
    if (!result) return;

    await Promise.all([
      this.cache.invalidate(CacheDependency.serviceCatalog(locationId)),
      this.cache.invalidate(CacheDependency.staffDirectory(locationId)),
      this.cache.invalidate(CacheDependency.staffSchedule(locationId)),
    ]);

    const { location, categories, services, staff } = result;
    const base = {
      brandId: location.brandId,
      locationId,
      actor,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
    };
    this.events.emit(AUDIT_EVENT, {
      ...base,
      entityType: AuditEntity.STAFF,
      entityId: staff.id,
      eventType: AuditEvent.STAFF_CREATED,
      payload: { name: staff.name },
    } satisfies AuditLogEvent);
    for (const category of categories) {
      this.events.emit(AUDIT_EVENT, {
        ...base,
        entityType: AuditEntity.SERVICE,
        entityId: category.id,
        eventType: AuditEvent.SERVICE_CATEGORY_CREATED,
        payload: { name: category.name },
      } satisfies AuditLogEvent);
    }
    for (const service of services) {
      this.events.emit(AUDIT_EVENT, {
        ...base,
        entityType: AuditEntity.SERVICE,
        entityId: service.id,
        eventType: AuditEvent.SERVICE_CREATED,
        payload: {
          title: service.title,
          price: service.price.toString(),
          durationMinutes: service.durationMinutes,
          currency: location.currency,
          categoryName: categories.find(
            (category) => category.id === service.categoryId,
          )?.name,
        },
      } satisfies AuditLogEvent);
    }
  }
}
