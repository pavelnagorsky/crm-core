import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServiceStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { PrismaErrorCode } from '../../shared/database/prisma-error-codes.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../shared/constants/multi-service.constants.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import {
  SERVICE_BUNDLE_AUDIT_FIELDS,
  toServiceBundleAuditShape,
} from '../audit/fields/service-bundle.fields.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../audit/utils/diff-fields.js';
import { LocationService } from '../location/location.service.js';
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
  category: { select: { name: true } },
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
  private readonly logger = new Logger(ServiceBundleService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly locationService: LocationService,
  ) {}

  async create(
    locationId: string,
    dto: CreateServiceBundleDto,
    actor: AuditActor,
  ): Promise<ServiceBundleView> {
    await this.assertBundleValid(locationId, dto);
    const bundle = await this.db.serviceBundle.create({
      data: {
        locationId,
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
    this.logger.log(
      `service bundle created: id=${bundle.id} locationId=${locationId} items=${bundle.items.length}`,
    );
    const currency =
      bundle.fixedPrice == null
        ? undefined
        : (await this.locationService.getLocale(locationId)).currency;
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: bundle.id,
      eventType: AuditEvent.SERVICE_BUNDLE_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: {
        title: bundle.title,
        pricingMode: bundle.pricingMode,
        executionMode: bundle.executionMode,
        itemTitles: bundle.items.map((item) => item.service.title).join(', '),
        ...(bundle.fixedPrice == null
          ? {}
          : { fixedPrice: MoneyService.format(bundle.fixedPrice), currency }),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return bundle;
  }

  async update(
    locationId: string,
    bundleId: string,
    dto: UpdateServiceBundleDto,
    actor: AuditActor,
  ): Promise<ServiceBundleView> {
    const old = await this.findInLocation(locationId, bundleId);
    if (dto.items)
      await this.assertBundleValid(locationId, {
        ...old,
        ...dto,
        items: dto.items,
      } as CreateServiceBundleDto);
    else
      await this.assertPricingValid(
        dto.pricingMode ?? old.pricingMode,
        dto.fixedPrice !== undefined
          ? dto.fixedPrice
          : (old.fixedPrice?.toString() ?? null),
      );

    const bundle = await this.db.serviceBundle.update({
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
    const changes = diffFields(
      toServiceBundleAuditShape(old),
      toServiceBundleAuditShape(bundle),
      SERVICE_BUNDLE_AUDIT_FIELDS,
    );
    if (changes.length > 0) {
      const currency = changes.some((change) => change.field === 'fixedPrice')
        ? (await this.locationService.getLocale(locationId)).currency
        : undefined;
      this.logger.log(
        `service bundle updated: id=${bundleId} locationId=${locationId} fields=${changes.map((change) => change.field).join(',')}`,
      );
      const event: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: bundleId,
        eventType: AuditEvent.SERVICE_BUNDLE_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes, ...(currency ? { currency } : {}) },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return bundle;
  }

  async findById(bundleId: string): Promise<ServiceBundleView> {
    const bundle = await this.db.serviceBundle.findUnique({
      where: { id: bundleId },
      include: serviceBundleInclude,
    });
    if (!bundle) throw new NotFoundException('Service bundle not found');
    return bundle;
  }

  async listForCatalog(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<ServiceBundleForCatalog[]> {
    return this.db.serviceBundle.findMany({
      where: catalogWhere(locationId, filter),
      include: serviceBundleCatalogInclude,
    }) as Promise<ServiceBundleForCatalog[]>;
  }

  async countForCatalog(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<number> {
    return this.db.serviceBundle.count({
      where: catalogWhere(locationId, filter),
    });
  }

  async countByStatusForCatalog(
    locationId: string,
    filter: ServiceFilter,
  ): Promise<ServiceStatusCount[]> {
    const rows = await this.db.serviceBundle.groupBy({
      by: ['status'],
      where: catalogWhere(locationId, filter),
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  }

  async changeStatus(
    locationId: string,
    bundleId: string,
    status: ServiceStatus,
    actor: AuditActor,
  ): Promise<void> {
    const bundle = await this.findInLocation(locationId, bundleId);
    if (bundle.status === status)
      throw new AppException(
        ErrorCode.SERVICE_STATUS_ALREADY_SET,
        HttpStatus.CONFLICT,
      );
    await this.db.serviceBundle.update({
      where: { id: bundleId },
      data: { status },
    });
    this.logger.log(
      `service bundle status: id=${bundleId} locationId=${locationId} status=${status}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: bundleId,
      eventType: AuditEvent.SERVICE_BUNDLE_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: {
        changes: [{ field: 'status', from: bundle.status, to: status }],
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async delete(
    locationId: string,
    bundleId: string,
    actor: AuditActor,
  ): Promise<void> {
    const bundle = await this.findInLocation(locationId, bundleId);
    try {
      await this.db.serviceBundle.delete({ where: { id: bundleId } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.SERVICE_IN_USE, HttpStatus.CONFLICT);
      }
      throw e;
    }
    this.logger.log(
      `service bundle deleted: id=${bundleId} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: bundleId,
      eventType: AuditEvent.SERVICE_BUNDLE_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { title: bundle.title },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private async findInLocation(
    locationId: string,
    bundleId: string,
  ): Promise<ServiceBundleView> {
    const bundle = await this.db.serviceBundle.findFirst({
      where: { id: bundleId, locationId },
      include: serviceBundleInclude,
    });
    if (!bundle) throw new NotFoundException('Service bundle not found');
    return bundle;
  }

  private async assertBundleValid(
    locationId: string,
    dto: CreateServiceBundleDto,
  ): Promise<void> {
    if (dto.items.length < 2 || dto.items.length > MULTI_SERVICE_MAX_ITEMS) {
      throw new AppException(
        ErrorCode.BUNDLE_ITEMS_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertPricingValid(
      dto.pricingMode ?? BundlePricingMode.SUM,
      dto.fixedPrice ?? null,
    );
    const uniqueServiceIds = [
      ...new Set(dto.items.map((item) => item.serviceId)),
    ];
    const count = await this.db.service.count({
      where: {
        locationId,
        id: { in: uniqueServiceIds },
        status: ServiceStatus.ACTIVE,
      },
    });
    if (count !== uniqueServiceIds.length) {
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async assertPricingValid(
    pricingMode: string,
    fixedPrice: string | null,
  ): Promise<void> {
    if (pricingMode === BundlePricingMode.FIXED && !fixedPrice) {
      throw new AppException(
        ErrorCode.BUNDLE_FIXED_PRICE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (pricingMode === BundlePricingMode.SUM && fixedPrice) {
      throw new AppException(
        ErrorCode.BUNDLE_PRICE_MODE_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
