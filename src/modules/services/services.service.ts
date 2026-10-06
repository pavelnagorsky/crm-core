import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServiceCategory,
  ServiceStatus,
  StaffStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServiceFilter } from './interfaces/service-filter.interface.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import {
  SERVICE_AUDIT_FIELDS,
  toServiceAuditShape,
} from '../audit/fields/service.fields.js';
import { SERVICE_CATEGORY_AUDIT_FIELDS } from '../audit/fields/service-category.fields.js';
import { LocationService } from '../location/location.service.js';
import { ServiceWithImage } from './interfaces/service-with-image.interface.js';
import { ServiceWithStaffCount } from './interfaces/service-with-staff-count.interface.js';
import { catalogWhere } from './catalog-where.js';
import { ServiceForCatalog } from './interfaces/service-for-catalog.interface.js';
import { ServiceStatusCount } from './interfaces/service-status-count.interface.js';

const serviceAuditInclude = {
  imageFile: true,
  category: { select: { name: true } },
} satisfies Prisma.ServiceInclude;

const serviceViewInclude = {
  imageFile: true,
  _count: { select: { staffServices: true } },
} satisfies Prisma.ServiceInclude;

const serviceCatalogInclude = {
  imageFile: true,
  category: { select: { name: true } },
  _count: { select: { staffServices: true } },
} satisfies Prisma.ServiceInclude;

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly locationService: LocationService,
  ) {}

  // ─── Service Categories ──────────────────────────────────────────────────────

  async createCategory(
    locationId: string,
    dto: CreateServiceCategoryDto,
    actor: AuditActor,
  ): Promise<ServiceCategory> {
    try {
      const category = await this.db.serviceCategory.create({
        data: {
          locationId,
          name: dto.name,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      this.logger.log(
        `service category created: id=${category.id} locationId=${locationId}`,
      );
      const event: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: category.id,
        eventType: AuditEvent.SERVICE_CATEGORY_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt: new Date(),
        actor,
        payload: {
          name: category.name,
          ...(category.description
            ? { description: category.description }
            : {}),
        },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
      return category;
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION)
        throw new AppException(
          ErrorCode.CATEGORY_NAME_EXISTS,
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  async updateCategory(
    locationId: string,
    categoryId: string,
    dto: UpdateServiceCategoryDto,
    actor: AuditActor,
  ): Promise<ServiceCategory> {
    const existing = await this.db.serviceCategory.findFirst({
      where: { id: categoryId, locationId },
    });
    if (!existing) throw new NotFoundException('Service category not found');

    try {
      const category = await this.db.serviceCategory.update({
        where: { id: categoryId },
        data: {
          name: dto.name,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
      });
      const changes = diffFields(
        existing,
        category,
        SERVICE_CATEGORY_AUDIT_FIELDS,
      );
      if (changes.length > 0) {
        this.logger.log(
          `service category updated: id=${categoryId} locationId=${locationId} fields=${changes.map((change) => change.field).join(',')}`,
        );
        const event: AuditLogEvent = {
          locationId,
          entityType: AuditEntity.SERVICE,
          entityId: categoryId,
          eventType: AuditEvent.SERVICE_CATEGORY_UPDATED,
          actionType: AuditActionType.MODIFY,
          occurredAt: new Date(),
          actor,
          payload: { changes },
        };
        this.eventEmitter.emit(AUDIT_EVENT, event);
      }
      return category;
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION)
        throw new AppException(
          ErrorCode.CATEGORY_NAME_EXISTS,
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  async listCategories(locationId: string): Promise<ServiceCategory[]> {
    return this.db.serviceCategory.findMany({
      where: { locationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteCategory(
    locationId: string,
    categoryId: string,
    actor: AuditActor,
  ): Promise<void> {
    const category = await this.db.serviceCategory.findFirst({
      where: { id: categoryId, locationId },
    });
    if (!category) throw new NotFoundException('Service category not found');
    await this.db.serviceCategory.delete({ where: { id: categoryId } });
    this.logger.log(
      `service category deleted: id=${categoryId} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: categoryId,
      eventType: AuditEvent.SERVICE_CATEGORY_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { name: category.name },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  // ─── Services ────────────────────────────────────────────────────────────────

  async create(
    locationId: string,
    dto: CreateServiceDto,
    actor: AuditActor,
  ): Promise<ServiceWithImage> {
    const service = await this.db.service.create({
      data: {
        locationId,
        categoryId: dto.categoryId ?? null,
        imageFileId: dto.imageFileId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes ?? 0,
        status: dto.status ?? ServiceStatus.ACTIVE,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: serviceAuditInclude,
    });
    const { currency } = await this.locationService.getLocale(locationId);
    this.logger.log(
      `service created: id=${service.id} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: service.id,
      eventType: AuditEvent.SERVICE_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: {
        title: service.title,
        price: service.price.toString(),
        durationMinutes: service.durationMinutes,
        currency,
        ...(service.category?.name
          ? { categoryName: service.category.name }
          : {}),
        ...(service.imageFile?.fileName
          ? { imageName: service.imageFile.fileName }
          : {}),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return service;
  }

  async update(
    locationId: string,
    serviceId: string,
    dto: UpdateServiceDto,
    actor: AuditActor,
  ): Promise<ServiceWithImage> {
    const old = await this.findInLocation(locationId, serviceId);
    const service = await this.db.service.update({
      where: { id: serviceId },
      data: {
        categoryId: dto.categoryId,
        imageFileId: dto.imageFileId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes,
        sortOrder: dto.sortOrder,
      },
      include: serviceAuditInclude,
    });
    const changes = diffFields(
      toServiceAuditShape(old),
      toServiceAuditShape(service),
      SERVICE_AUDIT_FIELDS,
    );
    if (changes.length > 0) {
      const currency = changes.some((change) => change.field === 'price')
        ? (await this.locationService.getLocale(locationId)).currency
        : undefined;
      this.logger.log(
        `service updated: id=${serviceId} locationId=${locationId} fields=${changes.map((change) => change.field).join(',')}`,
      );
      const event: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: serviceId,
        eventType: AuditEvent.SERVICE_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes, ...(currency ? { currency } : {}) },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return service;
  }

  async findById(serviceId: string): Promise<ServiceWithStaffCount> {
    const service = await this.db.service.findUnique({
      where: { id: serviceId },
      include: serviceViewInclude,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  private async findInLocation(locationId: string, serviceId: string) {
    const service = await this.db.service.findFirst({
      where: { id: serviceId, locationId },
      include: serviceAuditInclude,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async listForCatalog(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<ServiceForCatalog[]> {
    return this.db.service.findMany({
      where: catalogWhere(locationId, filter),
      include: serviceCatalogInclude,
    });
  }

  async countForCatalog(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<number> {
    return this.db.service.count({ where: catalogWhere(locationId, filter) });
  }

  async countByStatusForCatalog(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<ServiceStatusCount[]> {
    const rows = await this.db.service.groupBy({
      by: ['status'],
      where: catalogWhere(locationId, filter),
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  async assertIdsInBusiness(locationId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const found = await this.db.service.findMany({
      where: { locationId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new AppException(
        ErrorCode.COMPENSATION_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async findIdsByFilter(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<string[]> {
    const rows = await this.db.service.findMany({
      where: this.buildFilterWhere(locationId, filter),
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private buildFilterWhere(
    locationId: string,
    filter: ServiceFilter,
  ): Prisma.ServiceWhereInput {
    const where: Prisma.ServiceWhereInput = { locationId };
    const search = filter.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
        {
          category: { description: { contains: search, mode: 'insensitive' } },
        },
      ];
    }
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.status !== undefined) where.status = filter.status;
    return where;
  }

  async changeStatus(
    locationId: string,
    serviceId: string,
    status: ServiceStatus,
    actor: AuditActor,
  ): Promise<void> {
    const service = await this.findInLocation(locationId, serviceId);
    if (service.status === status) {
      throw new AppException(
        ErrorCode.SERVICE_STATUS_ALREADY_SET,
        HttpStatus.CONFLICT,
      );
    }
    await this.db.service.update({
      where: { id: serviceId },
      data: { status },
    });
    this.logger.log(
      `service status: id=${serviceId} locationId=${locationId} status=${status}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: serviceId,
      eventType: AuditEvent.SERVICE_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: {
        changes: [{ field: 'status', from: service.status, to: status }],
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async delete(
    locationId: string,
    serviceId: string,
    actor: AuditActor,
  ): Promise<void> {
    const service = await this.findInLocation(locationId, serviceId);
    try {
      await this.db.service.delete({ where: { id: serviceId } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.SERVICE_IN_USE, HttpStatus.CONFLICT);
      }
      throw e;
    }
    this.logger.log(
      `service deleted: id=${serviceId} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: serviceId,
      eventType: AuditEvent.SERVICE_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { title: service.title },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async countBookable(locationId: string): Promise<number> {
    return this.db.service.count({
      where: {
        locationId,
        status: ServiceStatus.ACTIVE,
        staffServices: { some: { staff: { status: StaffStatus.ACTIVE } } },
      },
    });
  }
}
