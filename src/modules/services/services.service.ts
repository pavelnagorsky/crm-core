import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Service, ServiceCategory } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { BusinessService } from '../business/business.service.js';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { ServiceSearchRequestDto } from './dto/service-search-request.dto.js';
import { ServiceSearchOrderBy } from './enums/service-search-order-by.enum.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';

@Injectable()
export class ServicesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly businessService: BusinessService,
  ) {}

  // ─── Service Categories ──────────────────────────────────────────────────────

  async createCategory(businessId: string, payload: TokenPayloadDto, dto: CreateServiceCategoryDto): Promise<ServiceCategory> {
    await this.businessService.assertOwner(businessId, payload);

    try {
      return await this.db.serviceCategory.create({
        data: {
          businessId,
          name: dto.name,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Category name already exists in this business');
      throw e;
    }
  }

  async listCategories(businessId: string): Promise<ServiceCategory[]> {
    return this.db.serviceCategory.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteCategory(categoryId: string, payload: TokenPayloadDto): Promise<void> {
    const category = await this.db.serviceCategory.findUnique({ where: { id: categoryId } });

    if (!category) throw new NotFoundException('Service category not found');

    await this.businessService.assertOwner(category.businessId, payload);
    await this.db.serviceCategory.delete({ where: { id: categoryId } });
  }

  // ─── Services ────────────────────────────────────────────────────────────────

  async create(businessId: string, payload: TokenPayloadDto, dto: CreateServiceDto): Promise<Service> {
    await this.businessService.assertOwner(businessId, payload);

    return this.db.service.create({
      data: {
        businessId,
        categoryId: dto.categoryId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes ?? 0,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(serviceId: string, payload: TokenPayloadDto, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.findById(serviceId);
    await this.businessService.assertOwner(service.businessId, payload);

    return this.db.service.update({
      where: { id: serviceId },
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async findById(serviceId: string): Promise<Service> {
    const service = await this.db.service.findUnique({ where: { id: serviceId } });

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

  async delete(serviceId: string, payload: TokenPayloadDto): Promise<void> {
    const service = await this.findById(serviceId);
    await this.businessService.assertOwner(service.businessId, payload);
    await this.db.service.delete({ where: { id: serviceId } });
  }
}
