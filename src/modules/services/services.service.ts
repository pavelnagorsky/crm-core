import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceCategory, ServiceStatus, StaffStatus } from '@prisma/client';
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
import { SERVICE_AUDIT_FIELDS } from '../audit/fields/service.fields.js';
import { BusinessService } from '../business/business.service.js';
import { ServiceWithImage } from './interfaces/service-with-image.interface.js';
import { ServiceWithStaffCount } from './interfaces/service-with-staff-count.interface.js';
import { catalogWhere } from './catalog-where.js';
import { ServiceForCatalog } from './interfaces/service-for-catalog.interface.js';
import { ServiceStatusCount } from './interfaces/service-status-count.interface.js';

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
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly businessService: BusinessService,
  ) {}

  // ─── Service Categories ──────────────────────────────────────────────────────

  async createCategory(businessId: string, dto: CreateServiceCategoryDto): Promise<ServiceCategory> {
    try {
      return await this.db.serviceCategory.create({
        data: {
          businessId,
          name: dto.name,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION)
        throw new AppException(ErrorCode.CATEGORY_NAME_EXISTS, HttpStatus.CONFLICT);
      throw e;
    }
  }

  async updateCategory(
    businessId: string,
    categoryId: string,
    dto: UpdateServiceCategoryDto,
  ): Promise<ServiceCategory> {
    const existing = await this.db.serviceCategory.findFirst({
      where: { id: categoryId, businessId },
    });
    if (!existing) throw new NotFoundException('Service category not found');

    try {
      return await this.db.serviceCategory.update({
        where: { id: categoryId },
        data: {
          name: dto.name,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
      });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION)
        throw new AppException(ErrorCode.CATEGORY_NAME_EXISTS, HttpStatus.CONFLICT);
      throw e;
    }
  }

  async listCategories(businessId: string): Promise<ServiceCategory[]> {
    return this.db.serviceCategory.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const category = await this.db.serviceCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Service category not found');
    await this.db.serviceCategory.delete({ where: { id: categoryId } });
  }

  // ─── Services ────────────────────────────────────────────────────────────────

  async create(businessId: string, dto: CreateServiceDto, actor: AuditActor): Promise<ServiceWithImage> {
    const service = await this.db.service.create({
      data: {
        businessId,
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
      include: { imageFile: true },
    });
    const { currency } = await this.businessService.getLocale(businessId);
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.SERVICE,
      entityId: service.id,
      eventType: AuditEvent.SERVICE_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: { title: service.title, price: service.price.toString(), durationMinutes: service.durationMinutes, currency },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return service;
  }

  async update(businessId: string, serviceId: string, dto: UpdateServiceDto, actor: AuditActor): Promise<ServiceWithImage> {
    const old = await this.findInBusiness(businessId, serviceId);
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
      include: { imageFile: true },
    });
    const changes = diffFields(old, service, SERVICE_AUDIT_FIELDS);
    if (changes.length > 0) {
      const currency = changes.some((change) => change.field === 'price')
        ? (await this.businessService.getLocale(businessId)).currency
        : undefined;
      const event: AuditLogEvent = {
        businessId,
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

  private async findInBusiness(businessId: string, serviceId: string): Promise<ServiceWithImage> {
    const service = await this.db.service.findFirst({ where: { id: serviceId, businessId }, include: { imageFile: true } });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async listForCatalog(businessId: string, filter: ServiceFilter): Promise<ServiceForCatalog[]> {
    return this.db.service.findMany({
      where: catalogWhere(businessId, filter),
      include: serviceCatalogInclude,
    });
  }

  async countForCatalog(businessId: string, filter: ServiceFilter): Promise<number> {
    return this.db.service.count({ where: catalogWhere(businessId, filter) });
  }

  async countByStatusForCatalog(
    businessId: string,
    filter: ServiceFilter,
  ): Promise<ServiceStatusCount[]> {
    const rows = await this.db.service.groupBy({
      by: ['status'],
      where: catalogWhere(businessId, filter),
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  async assertIdsInBusiness(businessId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const found = await this.db.service.findMany({
      where: { businessId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new AppException(ErrorCode.COMPENSATION_SERVICE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
  }

  async findIdsByFilter(businessId: string, filter: ServiceFilter): Promise<string[]> {
    const rows = await this.db.service.findMany({
      where: this.buildFilterWhere(businessId, filter),
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private buildFilterWhere(businessId: string, filter: ServiceFilter): Prisma.ServiceWhereInput {
    const where: Prisma.ServiceWhereInput = { businessId };
    const search = filter.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
        { category: { description: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.status !== undefined) where.status = filter.status;
    return where;
  }

  async changeStatus(businessId: string, serviceId: string, status: ServiceStatus, actor: AuditActor): Promise<void> {
    const service = await this.findInBusiness(businessId, serviceId);
    if (service.status === status) {
      throw new AppException(ErrorCode.SERVICE_STATUS_ALREADY_SET, HttpStatus.CONFLICT);
    }
    await this.db.service.update({ where: { id: serviceId }, data: { status } });
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.SERVICE,
      entityId: serviceId,
      eventType: AuditEvent.SERVICE_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: { changes: [{ field: 'status', from: service.status, to: status }] },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async delete(businessId: string, serviceId: string, actor: AuditActor): Promise<void> {
    const service = await this.findInBusiness(businessId, serviceId);
    try {
      await this.db.service.delete({ where: { id: serviceId } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.SERVICE_IN_USE, HttpStatus.CONFLICT);
      }
      throw e;
    }
    const event: AuditLogEvent = {
      businessId,
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

  async countBookable(businessId: string): Promise<number> {
    return this.db.service.count({
      where: {
        businessId,
        status: ServiceStatus.ACTIVE,
        staffServices: { some: { staff: { status: StaffStatus.ACTIVE } } },
      },
    });
  }

}
