import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Service, ServiceCategory } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PublicServiceCategoryDto } from './dto/public-service-category.dto.js';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServiceSearchRequestDto } from './dto/service-search-request.dto.js';
import { ServiceSearchOrderBy } from './enums/service-search-order-by.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { diffFields, FieldDescriptor } from '../audit/utils/diff-fields.js';

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

  async listGroupedByCategory(businessId: string): Promise<PublicServiceCategoryDto[]> {
    const activeServicesOrder: Prisma.ServiceOrderByWithRelationInput[] = [
      { sortOrder: 'asc' },
      { title: 'asc' },
    ];

    const [categories, uncategorized] = await this.db.$transaction([
      this.db.serviceCategory.findMany({
        where: { businessId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          services: {
            where: { isActive: true },
            orderBy: activeServicesOrder,
          },
        },
      }),
      this.db.service.findMany({
        where: { businessId, categoryId: null, isActive: true },
        orderBy: activeServicesOrder,
      }),
    ]);

    const result = categories.map(PublicServiceCategoryDto.fromEntity);
    if (uncategorized.length) result.push(PublicServiceCategoryDto.uncategorized(uncategorized));
    return result;
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
    const changes = diffFields(old, service, ServicesService.SERVICE_FIELDS);
    if (changes.length > 0) {
      const event: AuditLogEvent = {
        businessId,
        entityType: AuditEntity.SERVICE,
        entityId: serviceId,
        eventType: AuditEvent.SERVICE_UPDATED,
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
    const where: Prisma.ServiceWhereInput = { businessId };

    if (dto.search) where.title = { contains: dto.search, mode: 'insensitive' };
    if (dto.categoryId !== undefined) where.categoryId = dto.categoryId;
    if (dto.isActive !== undefined) where.isActive = dto.isActive;

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
      actor,
      payload: { title: service.title },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private static readonly SERVICE_FIELDS: FieldDescriptor<Service>[] = [
    { key: 'title', labelRu: 'Название' },
    { key: 'price', labelRu: 'Цена', format: (v) => String(v ?? '—') },
    { key: 'durationMinutes', labelRu: 'Длительность (мин)' },
    { key: 'bufferMinutes', labelRu: 'Буфер (мин)' },
    { key: 'description', labelRu: 'Описание' },
    { key: 'isActive', labelRu: 'Активна' },
  ];
}
