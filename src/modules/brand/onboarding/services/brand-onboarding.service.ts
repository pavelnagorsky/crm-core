import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Location, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { CountryCurrency } from '../../../../shared/geo/country-defaults.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { ServiceCategoriesService } from '../../../services/categories/services/service-categories.service.js';
import { ServiceWriteService } from '../../../services/service-write/services/service-write.service.js';
import { STARTER_CATALOG } from '../../../services/starter-catalog/constants/starter-catalog.constants.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { CreateBrandDto } from '../../dto/create-brand.dto.js';
import { BrandWithLocations } from '../../interfaces/brand-with-locations.interface.js';
import { BrandService } from '../../services/brand.service.js';
import { BrandStarterData } from '../interfaces/brand-starter-data.interface.js';

@Injectable()
export class BrandOnboardingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly brands: BrandService,
    private readonly categories: ServiceCategoriesService,
    private readonly services: ServiceWriteService,
    private readonly staff: StaffService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates the brand, its first location, starter services for the business
   * type and the owner's staff card in one transaction.
   */
  async createBrand(
    userId: string,
    dto: CreateBrandDto,
    actor: AuditActor,
  ): Promise<BrandWithLocations> {
    const { brand, starter } = await this.db.$transaction(async (tx) => {
      const brand = await this.brands.create(userId, dto, tx);
      const starter = await this.createStarterData(
        brand.locations[0],
        userId,
        tx,
      );
      return { brand, starter };
    });

    this.brands.recordCreated(brand, actor);
    this.recordStarterData(starter, actor);
    return brand;
  }

  private async createStarterData(
    location: Location,
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<BrandStarterData> {
    const template =
      location.businessType == null
        ? []
        : STARTER_CATALOG[location.businessType];
    // resolveLocationLocale restricted the currency to a supported country's currency.
    const currency = location.currency as CountryCurrency;
    const categories = template.length
      ? await this.categories.createStarterCategories(
          location.id,
          template.map((category) => category.name),
          tx,
        )
      : [];
    const categoryIds = new Map(
      categories.map((category) => [category.name, category.id]),
    );
    const services = template.length
      ? await this.services.createStarterServices(
          location.id,
          template.flatMap((category) =>
            category.services.map((service, sortOrder) => ({
              categoryId: categoryIds.get(category.name)!,
              title: service.title,
              durationMinutes: service.durationMinutes,
              price: service.prices[currency],
              sortOrder,
            })),
          ),
          tx,
        )
      : [];
    const staff = await this.staff.createInitialOwner(
      location.id,
      userId,
      services.map((service) => service.id),
      tx,
    );
    return { location, categories, services, staff };
  }

  private recordStarterData(
    { location, categories, services, staff }: BrandStarterData,
    actor: AuditActor,
  ): void {
    const base = {
      brandId: location.brandId,
      locationId: location.id,
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
