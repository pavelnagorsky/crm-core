import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../shared/constants/multi-service.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { CreateServiceBundleDto } from './dto/create-service-bundle.dto.js';
import { UpdateServiceBundleDto } from './dto/update-service-bundle.dto.js';
import { ServiceSearchRequestDto } from './dto/service-search-request.dto.js';
import { ServiceSearchOrderBy } from './enums/service-search-order-by.enum.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { ServiceBundleView } from './interfaces/service-bundle-view.interface.js';

const serviceBundleInclude = {
  imageFile: true,
  items: { orderBy: { sortOrder: 'asc' as const }, include: { service: true } },
};

@Injectable()
export class ServiceBundleService {
  constructor(private readonly db: DatabaseService) {}

  async create(businessId: string, dto: CreateServiceBundleDto, _actor: AuditActor): Promise<ServiceBundleView> {
    await this.assertBundleValid(businessId, dto);
    return this.db.serviceBundle.create({
      data: {
        businessId,
        categoryId: dto.categoryId ?? null,
        imageFileId: dto.imageFileId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        executionMode: dto.executionMode ?? 'SEQUENTIAL',
        pricingMode: dto.pricingMode ?? BundlePricingMode.SUM,
        fixedPrice: dto.fixedPrice ?? null,
        status: dto.status ?? ServiceStatus.ACTIVE,
        sortOrder: dto.sortOrder ?? 0,
        items: {
          create: dto.items.map((item, index) => ({
            serviceId: item.serviceId,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
      include: serviceBundleInclude,
    });
  }

  async update(businessId: string, bundleId: string, dto: UpdateServiceBundleDto, _actor: AuditActor): Promise<ServiceBundleView> {
    const old = await this.findInBusiness(businessId, bundleId);
    if (dto.items) await this.assertBundleValid(businessId, { ...old, ...dto, items: dto.items } as CreateServiceBundleDto);
    else await this.assertPricingValid(dto.pricingMode ?? old.pricingMode, dto.fixedPrice !== undefined ? dto.fixedPrice : old.fixedPrice?.toString() ?? null);

    return this.db.serviceBundle.update({
      where: { id: bundleId },
      data: {
        categoryId: dto.categoryId,
        imageFileId: dto.imageFileId,
        title: dto.title,
        description: dto.description,
        executionMode: dto.executionMode,
        pricingMode: dto.pricingMode,
        fixedPrice: dto.fixedPrice !== undefined ? dto.fixedPrice : undefined,
        status: dto.status,
        sortOrder: dto.sortOrder,
        ...(dto.items
          ? {
              items: {
                deleteMany: {},
                create: dto.items.map((item, index) => ({
                  serviceId: item.serviceId,
                  sortOrder: item.sortOrder ?? index,
                })),
              },
            }
          : {}),
      },
      include: serviceBundleInclude,
    });
  }

  async findById(bundleId: string): Promise<ServiceBundleView> {
    const bundle = await this.db.serviceBundle.findUnique({
      where: { id: bundleId },
      include: serviceBundleInclude,
    });
    if (!bundle) throw new NotFoundException('Service bundle not found');
    return bundle;
  }

  async search(businessId: string, dto: ServiceSearchRequestDto): Promise<PaginatedResult<ServiceBundleView>> {
    const where = this.buildWhere(businessId, dto);
    const direction = dto.orderDirection ?? OrderDirection.ASC;
    const orderBy = stableOrderBy(this.buildOrderBy(dto.orderBy ?? ServiceSearchOrderBy.SORT_ORDER, direction), direction);
    const findArgs: Prisma.ServiceBundleFindManyArgs = { where, orderBy, include: serviceBundleInclude };
    if (!dto.isExport) {
      findArgs.skip = (dto.page - 1) * dto.pageSize;
      findArgs.take = dto.pageSize;
    }
    const [items, totalItems] = await Promise.all([
      this.db.serviceBundle.findMany(findArgs) as Promise<ServiceBundleView[]>,
      this.db.serviceBundle.count({ where }),
    ]);
    return { items, totalItems };
  }

  async changeStatus(businessId: string, bundleId: string, status: ServiceStatus, _actor: AuditActor): Promise<void> {
    const bundle = await this.findInBusiness(businessId, bundleId);
    if (bundle.status === status) throw new AppException(ErrorCode.SERVICE_STATUS_ALREADY_SET, HttpStatus.CONFLICT);
    await this.db.serviceBundle.update({ where: { id: bundleId }, data: { status } });
  }

  async delete(businessId: string, bundleId: string, _actor: AuditActor): Promise<void> {
    await this.findInBusiness(businessId, bundleId);
    try {
      await this.db.serviceBundle.delete({ where: { id: bundleId } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.SERVICE_IN_USE, HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  private async findInBusiness(businessId: string, bundleId: string): Promise<ServiceBundleView> {
    const bundle = await this.db.serviceBundle.findFirst({
      where: { id: bundleId, businessId },
      include: serviceBundleInclude,
    });
    if (!bundle) throw new NotFoundException('Service bundle not found');
    return bundle;
  }

  private async assertBundleValid(businessId: string, dto: CreateServiceBundleDto): Promise<void> {
    if (dto.items.length < 2 || dto.items.length > MULTI_SERVICE_MAX_ITEMS) {
      throw new AppException(ErrorCode.BUNDLE_ITEMS_INVALID, HttpStatus.BAD_REQUEST);
    }
    await this.assertPricingValid(dto.pricingMode ?? BundlePricingMode.SUM, dto.fixedPrice ?? null);
    const uniqueServiceIds = [...new Set(dto.items.map((item) => item.serviceId))];
    const count = await this.db.service.count({
      where: { businessId, id: { in: uniqueServiceIds }, status: ServiceStatus.ACTIVE },
    });
    if (count !== uniqueServiceIds.length) {
      throw new AppException(ErrorCode.BOOKING_SERVICE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
  }

  private async assertPricingValid(pricingMode: string, fixedPrice: string | null): Promise<void> {
    if (pricingMode === BundlePricingMode.FIXED && !fixedPrice) {
      throw new AppException(ErrorCode.BUNDLE_FIXED_PRICE_REQUIRED, HttpStatus.BAD_REQUEST);
    }
    if (pricingMode === BundlePricingMode.SUM && fixedPrice) {
      throw new AppException(ErrorCode.BUNDLE_PRICE_MODE_INVALID, HttpStatus.BAD_REQUEST);
    }
  }

  private buildWhere(businessId: string, dto: ServiceSearchRequestDto): Prisma.ServiceBundleWhereInput {
    const where: Prisma.ServiceBundleWhereInput = { businessId };
    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (dto.categoryId !== undefined) where.categoryId = dto.categoryId;
    if (dto.status !== undefined) where.status = dto.status;
    return where;
  }

  private buildOrderBy(orderBy: ServiceSearchOrderBy, direction: OrderDirection): Prisma.ServiceBundleOrderByWithRelationInput {
    switch (orderBy) {
      case ServiceSearchOrderBy.CATEGORY:
        return { category: { name: direction } };
      case ServiceSearchOrderBy.TITLE:
        return { title: direction };
      case ServiceSearchOrderBy.STATUS:
        return { status: direction };
      case ServiceSearchOrderBy.CREATED_AT:
        return { createdAt: direction };
      case ServiceSearchOrderBy.SORT_ORDER:
      case ServiceSearchOrderBy.DURATION_MINUTES:
      case ServiceSearchOrderBy.PRICE:
      default:
        return { sortOrder: direction };
    }
  }
}
