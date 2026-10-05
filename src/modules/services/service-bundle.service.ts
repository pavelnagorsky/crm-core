import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../shared/constants/multi-service.constants.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { CreateServiceBundleDto } from './dto/create-service-bundle.dto.js';
import { UpdateServiceBundleDto } from './dto/update-service-bundle.dto.js';
import { BundlePricingMode } from './enums/bundle-pricing-mode.enum.js';
import { catalogWhere } from './catalog-where.js';
import { ServiceBundleView } from './interfaces/service-bundle-view.interface.js';
import { ServiceBundleForCatalog } from './interfaces/service-bundle-for-catalog.interface.js';
import { ServiceFilter } from './interfaces/service-filter.interface.js';
import { ServiceStatusCount } from './interfaces/service-status-count.interface.js';

const serviceBundleInclude = {
  imageFile: true,
  items: { orderBy: { sortOrder: 'asc' as const }, include: { service: true } },
};

const serviceBundleCatalogInclude = {
  imageFile: true,
  category: { select: { name: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      service: {
        select: {
          title: true,
          price: true,
          durationMinutes: true,
          bufferMinutes: true,
        },
      },
    },
  },
} satisfies Prisma.ServiceBundleInclude;

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

  async listForCatalog(businessId: string, filter: ServiceFilter): Promise<ServiceBundleForCatalog[]> {
    return this.db.serviceBundle.findMany({
      where: catalogWhere(businessId, filter),
      include: serviceBundleCatalogInclude,
    }) as Promise<ServiceBundleForCatalog[]>;
  }

  async countForCatalog(businessId: string, filter: ServiceFilter): Promise<number> {
    return this.db.serviceBundle.count({ where: catalogWhere(businessId, filter) });
  }

  async countByStatusForCatalog(
    businessId: string,
    filter: ServiceFilter,
  ): Promise<ServiceStatusCount[]> {
    const rows = await this.db.serviceBundle.groupBy({
      by: ['status'],
      where: catalogWhere(businessId, filter),
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
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

}
