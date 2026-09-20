import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Service, ServiceCategory } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServiceSearchRequestDto } from './dto/service-search-request.dto.js';
import { ServiceSearchOrderBy } from './enums/service-search-order-by.enum.js';
import { ServiceFilter } from './interfaces/service-filter.interface.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { SERVICE_AUDIT_FIELDS } from '../audit/fields/service.fields.js';

@Injectable()
export class ServicesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Service Categories ──────────────────────────────────────────────────────

  async createCategory(businessId: string, dto: CreateServiceCategoryDto): Promise<ServiceCategory> {
    try {
      return await this.db.serviceCategory.create({
        data: {
          businessId,
          name: dto.name,
          sortOrder: dto.sortOrder ?? 0,
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

  async create(businessId: string, dto: CreateServiceDto, actor: AuditActor): Promise<Service> {
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
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    const event: AuditLogEvent = {
      businessId,
      entityType: AuditEntity.SERVICE,
      entityId: service.id,
      eventType: AuditEvent.SERVICE_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: { title: service.title, price: service.price.toString(), durationMinutes: service.durationMinutes },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return service;
  }

  async update(businessId: string, serviceId: string, dto: UpdateServiceDto, actor: AuditActor): Promise<Service> {
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
    });
    const changes = diffFields(old, service, SERVICE_AUDIT_FIELDS);
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        businessId,
        entityType: AuditEntity.SERVICE,
        entityId: serviceId,
        eventType: AuditEvent.SERVICE_UPDATED,
        actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: { changes },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return service;
  }

  async findById(serviceId: string): Promise<Service> {
    const service = await this.db.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  private async findInBusiness(businessId: string, serviceId: string): Promise<Service> {
    const service = await this.db.service.findFirst({ where: { id: serviceId, businessId } });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async search(businessId: string, dto: ServiceSearchRequestDto): Promise<PaginatedResult<Service>> {
    const where = this.buildFilterWhere(businessId, dto);

    const orderBy: Prisma.ServiceOrderByWithRelationInput = {
      [dto.orderBy ?? ServiceSearchOrderBy.SORT_ORDER]: dto.orderDirection ?? OrderDirection.ASC,
    };

    const findArgs: Prisma.ServiceFindManyArgs = { where, orderBy };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }

    const [items, totalItems] = await this.db.$transaction([
      this.db.service.findMany(findArgs),
      this.db.service.count({ where }),
    ]);

    return { items, totalItems };
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
    if (filter.search) where.title = { contains: filter.search, mode: 'insensitive' };
    if (filter.categoryId !== undefined) where.categoryId = filter.categoryId;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    return where;
  }

  async setActive(serviceId: string, isActive: boolean): Promise<Service> {
    await this.findById(serviceId);
    return this.db.service.update({ where: { id: serviceId }, data: { isActive } });
  }

  async delete(businessId: string, serviceId: string, actor: AuditActor): Promise<void> {
    const service = await this.findInBusiness(businessId, serviceId);
    await this.db.service.delete({ where: { id: serviceId } });
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

}
