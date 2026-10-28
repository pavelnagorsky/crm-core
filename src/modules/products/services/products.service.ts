import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  Product,
  ProductCategory,
  ProductLocation,
  ProductStatus,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import {
  ACTIVE_BRAND_WHERE,
  ACTIVE_LOCATION_WHERE,
} from '../../../shared/database/active-business.where.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { BRAND_PRODUCT_CATALOG_CACHE } from '../cache/brand-product-catalog.cache.js';
import { LOCATION_PRODUCT_OFFERS_CACHE } from '../cache/location-product-offers.cache.js';
import {
  PUBLIC_PRODUCT_CATEGORY_SELECT,
  PUBLIC_PRODUCT_OFFER_SELECT,
  PUBLIC_PRODUCT_SELECT,
} from '../constants/public-product.select.js';
import { CreateProductCategoryDto } from '../dto/create-product-category.dto.js';
import { CreateProductDto } from '../dto/create-product.dto.js';
import { LocationProductSearchRequestDto } from '../dto/location-product-search-request.dto.js';
import { ProductSearchRequestDto } from '../dto/product-search-request.dto.js';
import { ProductStatusCountsRequestDto } from '../dto/product-status-counts-request.dto.js';
import { UpdateProductCategoryDto } from '../dto/update-product-category.dto.js';
import { UpdateProductDto } from '../dto/update-product.dto.js';
import { UpsertProductLocationDto } from '../dto/upsert-product-location.dto.js';
import { ProductLocationSearchOrderBy } from '../enums/product-location-search-order-by.enum.js';
import { ProductSearchOrderBy } from '../enums/product-search-order-by.enum.js';
import { BrandProductCatalog } from '../interfaces/brand-product-catalog.interface.js';
import { LocationProductView } from '../interfaces/location-product-view.interface.js';
import { ProductStatusCount } from '../interfaces/product-status-count.interface.js';
import { ProductWithDetails } from '../interfaces/product-with-details.interface.js';
import { PublicCatalogProduct } from '../interfaces/public-catalog-product.interface.js';

const productDetailsInclude = {
  category: true,
  imageFile: true,
  locations: { where: { location: ACTIVE_LOCATION_WHERE } },
  packagings: { orderBy: [{ name: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ProductInclude;

const locationProductInclude = {
  product: {
    include: {
      category: true,
      imageFile: true,
      packagings: {
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      },
    },
  },
} satisfies Prisma.ProductLocationInclude;

const PRODUCT_STATUSES = [ProductStatus.ACTIVE, ProductStatus.INACTIVE];

@Injectable()
export class ProductsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: AppCacheService,
  ) {}

  async createCategory(
    brandId: string,
    dto: CreateProductCategoryDto,
    actor: AuditActor,
  ): Promise<ProductCategory> {
    try {
      const category = await this.db.productCategory.create({
        data: {
          brandId,
          name: dto.name.trim(),
          description: this.optionalText(dto.description),
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.cache.invalidate(CacheDependency.brandProducts(brandId));
      this.emit(
        brandId,
        null,
        category.id,
        AuditEvent.PRODUCT_CATEGORY_CREATED,
        AuditActionType.CREATE,
        actor,
        {
          name: category.name,
          description: category.description,
        },
      );
      return category;
    } catch (error: any) {
      this.rethrowUnique(error, ErrorCode.PRODUCT_CATEGORY_NAME_EXISTS);
      throw error;
    }
  }

  listCategories(brandId: string): Promise<ProductCategory[]> {
    return this.db.productCategory.findMany({
      where: { brand: ACTIVE_BRAND_WHERE, brandId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  async updateCategory(
    brandId: string,
    categoryId: string,
    dto: UpdateProductCategoryDto,
    actor: AuditActor,
  ): Promise<ProductCategory> {
    const old = await this.findCategory(brandId, categoryId);
    try {
      const category = await this.db.productCategory.update({
        where: { id: categoryId },
        data: {
          name: dto.name?.trim(),
          description:
            dto.description !== undefined
              ? this.optionalText(dto.description)
              : undefined,
          sortOrder: dto.sortOrder,
        },
      });
      await this.cache.invalidate(CacheDependency.brandProducts(brandId));
      this.emitChanges(
        brandId,
        null,
        category.id,
        AuditEvent.PRODUCT_CATEGORY_UPDATED,
        actor,
        old,
        category,
        ['name', 'description', 'sortOrder'],
      );
      return category;
    } catch (error: any) {
      this.rethrowUnique(error, ErrorCode.PRODUCT_CATEGORY_NAME_EXISTS);
      throw error;
    }
  }

  async deleteCategory(
    brandId: string,
    categoryId: string,
    actor: AuditActor,
  ): Promise<void> {
    const category = await this.findCategory(brandId, categoryId);
    await this.db.productCategory.delete({ where: { id: categoryId } });
    await this.cache.invalidate(CacheDependency.brandProducts(brandId));
    this.emit(
      brandId,
      null,
      category.id,
      AuditEvent.PRODUCT_CATEGORY_DELETED,
      AuditActionType.DELETE,
      actor,
      {
        name: category.name,
      },
    );
  }

  async create(
    brandId: string,
    dto: CreateProductDto,
    actor: AuditActor,
  ): Promise<Product> {
    await this.assertCategory(brandId, dto.categoryId);
    try {
      const product = await this.db.product.create({
        data: {
          brandId,
          categoryId: dto.categoryId ?? null,
          imageFileId: dto.imageFileId ?? null,
          name: dto.name.trim(),
          description: this.optionalText(dto.description),
          sku: this.optionalCode(dto.sku),
          barcode: this.optionalCode(dto.barcode),
          unit: dto.unit,
          status: dto.status,
        },
      });
      await this.cache.invalidate(CacheDependency.brandProducts(brandId));
      this.emit(
        brandId,
        null,
        product.id,
        AuditEvent.PRODUCT_CREATED,
        AuditActionType.CREATE,
        actor,
        {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit: product.unit,
        },
      );
      return product;
    } catch (error: any) {
      this.rethrowProductUnique(error);
      throw error;
    }
  }

  async update(
    brandId: string,
    productId: string,
    dto: UpdateProductDto,
    actor: AuditActor,
  ): Promise<Product> {
    const old = await this.findProductForMutation(brandId, productId);
    await this.assertCategory(brandId, dto.categoryId);
    try {
      const product = await this.db.$transaction(async (tx) => {
        if (dto.unit != null) {
          await this.lockProduct(brandId, productId, tx);
          const used = await tx.product.count({
            where: {
              brand: ACTIVE_BRAND_WHERE,
              id: productId,
              unit: { not: dto.unit },
              OR: [{ locations: { some: {} } }, { packagings: { some: {} } }],
            },
          });
          if (used > 0)
            throw new AppException(
              ErrorCode.PRODUCT_UNIT_IMMUTABLE,
              HttpStatus.CONFLICT,
            );
        }
        return tx.product.update({
          where: { id: productId },
          data: {
            name: dto.name?.trim(),
            description:
              dto.description !== undefined
                ? this.optionalText(dto.description)
                : undefined,
            categoryId:
              dto.categoryId !== undefined
                ? (dto.categoryId ?? null)
                : undefined,
            imageFileId:
              dto.imageFileId !== undefined
                ? (dto.imageFileId ?? null)
                : undefined,
            sku: dto.sku !== undefined ? this.optionalCode(dto.sku) : undefined,
            barcode:
              dto.barcode !== undefined
                ? this.optionalCode(dto.barcode)
                : undefined,
            unit: dto.unit,
          },
        });
      });
      await this.cache.invalidate(CacheDependency.brandProducts(brandId));
      this.emitChanges(
        brandId,
        null,
        product.id,
        AuditEvent.PRODUCT_UPDATED,
        actor,
        old,
        product,
        [
          'name',
          'description',
          'categoryId',
          'imageFileId',
          'sku',
          'barcode',
          'unit',
        ],
      );
      return product;
    } catch (error: any) {
      this.rethrowProductUnique(error);
      throw error;
    }
  }

  async changeStatus(
    brandId: string,
    productId: string,
    status: ProductStatus,
    actor: AuditActor,
  ): Promise<Product> {
    const product = await this.findProductForMutation(brandId, productId);
    if (product.status === status) {
      throw new AppException(
        ErrorCode.PRODUCT_STATUS_ALREADY_SET,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.db.product.update({
      where: { id: productId },
      data: { status },
    });
    await this.cache.invalidate(CacheDependency.brandProducts(brandId));
    this.emitChanges(
      brandId,
      null,
      productId,
      AuditEvent.PRODUCT_UPDATED,
      actor,
      product,
      { ...product, status },
      ['status'],
    );
    return updated;
  }

  async delete(
    brandId: string,
    productId: string,
    actor: AuditActor,
  ): Promise<void> {
    const product = await this.findProductForMutation(brandId, productId);
    try {
      await this.db.product.delete({ where: { id: productId } });
    } catch (error: any) {
      if (error?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.PRODUCT_IN_USE, HttpStatus.CONFLICT);
      }
      throw error;
    }
    await this.cache.invalidate(CacheDependency.brandProducts(brandId));
    this.emit(
      brandId,
      null,
      productId,
      AuditEvent.PRODUCT_DELETED,
      AuditActionType.DELETE,
      actor,
      {
        name: product.name,
      },
    );
  }

  async upsertLocation(
    locationId: string,
    productId: string,
    dto: UpsertProductLocationDto,
    actor: AuditActor,
  ): Promise<ProductLocation> {
    const location = await this.locations.findById(locationId);
    const product = await this.findProductForMutation(
      location.brandId,
      productId,
    );
    const old = await this.db.productLocation.findUnique({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        productId_locationId: { productId, locationId },
      },
    });
    if (old?.trackInventory && !dto.trackInventory) {
      throw new AppException(
        ErrorCode.PRODUCT_INVENTORY_TRACKING_IMMUTABLE,
        HttpStatus.CONFLICT,
      );
    }
    const row = await this.db.productLocation.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: {
        productId,
        locationId,
        retailPrice: dto.retailPrice,
        status: dto.status,
        trackInventory: dto.trackInventory,
        reorderLevel: dto.reorderLevel ?? '0.000',
      },
      update: {
        retailPrice: dto.retailPrice,
        status: dto.status,
        trackInventory: dto.trackInventory,
        reorderLevel: dto.reorderLevel ?? '0.000',
      },
    });
    await this.cache.invalidate(CacheDependency.locationProducts(locationId));
    this.emit(
      product.brandId,
      locationId,
      productId,
      AuditEvent.PRODUCT_LOCATION_UPDATED,
      AuditActionType.MODIFY,
      actor,
      {
        productName: product.name,
        currency: location.currency,
        changes: this.changes(old, row, [
          'retailPrice',
          'status',
          'trackInventory',
          'reorderLevel',
        ]),
      },
    );
    return row;
  }

  async findByIdInBrand(
    brandId: string,
    productId: string,
  ): Promise<ProductWithDetails> {
    const product = await this.db.product.findFirst({
      where: { brand: ACTIVE_BRAND_WHERE, id: productId, brandId },
      include: productDetailsInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  resolveForPackagingCreation(
    brandId: string,
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Product> {
    return this.lockProduct(brandId, productId, tx);
  }

  private async lockProduct(
    brandId: string,
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Product> {
    const products = await tx.$queryRaw<Product[]>(Prisma.sql`
      SELECT * FROM "Product" WHERE id = ${productId} AND "brandId" = ${brandId} FOR UPDATE
    `);
    if (!products[0]) throw new NotFoundException('Product not found');
    return products[0];
  }

  private async findProductForMutation(
    brandId: string,
    productId: string,
  ): Promise<Product> {
    const product = await this.db.product.findFirst({
      where: { brand: ACTIVE_BRAND_WHERE, id: productId, brandId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async search(
    brandId: string,
    dto: ProductSearchRequestDto,
  ): Promise<PaginatedResult<ProductWithDetails>> {
    const where = this.productWhere(brandId, dto);
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.ProductFindManyArgs = {
      where,
      include: productDetailsInclude,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? ProductSearchOrderBy.CREATED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.product.findMany(args),
      this.db.product.count({ where }),
    ]);
    return { items: items as ProductWithDetails[], totalItems };
  }

  async getStatusCounts(
    brandId: string,
    dto: ProductStatusCountsRequestDto,
  ): Promise<ProductStatusCount[]> {
    const rows = await this.db.product.groupBy({
      by: ['status'],
      where: this.productWhere(brandId, dto),
      _count: { _all: true },
    });
    const byStatus = new Map(rows.map((row) => [row.status, row._count._all]));
    return PRODUCT_STATUSES.map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    }));
  }

  async searchLocation(
    locationId: string,
    dto: LocationProductSearchRequestDto,
  ): Promise<PaginatedResult<LocationProductView>> {
    const where: Prisma.ProductLocationWhereInput = {
      location: ACTIVE_LOCATION_WHERE,
      locationId,
    };
    const search = dto.search?.trim();
    if (search) {
      where.product = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      };
    }
    if (dto.categoryId) {
      where.product = {
        ...(where.product as object),
        categoryId: dto.categoryId,
      };
    }
    if (dto.status) where.status = dto.status;
    if (dto.trackInventory !== undefined) {
      where.trackInventory = dto.trackInventory;
    }
    if (dto.productIds?.length) where.productId = { in: dto.productIds };
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const orderBy = this.locationOrder(
      dto.orderBy ?? ProductLocationSearchOrderBy.UPDATED_AT,
      direction,
    );
    const args: Prisma.ProductLocationFindManyArgs = {
      where,
      include: locationProductInclude,
      orderBy,
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.productLocation.findMany(args),
      this.db.productLocation.count({ where }),
    ]);
    return { items: items as LocationProductView[], totalItems };
  }

  async listForPublicCatalog(
    locationId: string,
  ): Promise<PublicCatalogProduct[]> {
    const { brandId } = await this.locations.getBookingSettings(locationId);
    const [catalog, offers] = await Promise.all([
      this.cache.getOrLoad(BRAND_PRODUCT_CATALOG_CACHE, { brandId }, () =>
        this.loadBrandCatalog(brandId),
      ),
      this.cache.getOrLoad(
        LOCATION_PRODUCT_OFFERS_CACHE,
        { brandId, locationId },
        () => this.loadLocationOffers(locationId),
      ),
    ]);
    const byProduct = new Map(offers.map((offer) => [offer.productId, offer]));
    const categories = new Map(
      catalog.categories.map((category) => [category.id, category]),
    );
    return catalog.products.flatMap((product) => {
      const offer = byProduct.get(product.id);
      return offer
        ? [
            {
              ...offer,
              product: {
                ...product,
                category: product.categoryId
                  ? (categories.get(product.categoryId) ?? null)
                  : null,
              },
            },
          ]
        : [];
    });
  }

  async warmPublicCatalog(locationId: string): Promise<void> {
    const { brandId } = await this.locations.getBookingSettings(locationId);
    await Promise.all([
      this.cache.warm(BRAND_PRODUCT_CATALOG_CACHE, { brandId }, () =>
        this.loadBrandCatalog(brandId),
      ),
      this.cache.warm(
        LOCATION_PRODUCT_OFFERS_CACHE,
        { brandId, locationId },
        () => this.loadLocationOffers(locationId),
      ),
    ]);
  }

  private async loadBrandCatalog(
    brandId: string,
  ): Promise<BrandProductCatalog> {
    const [products, categories] = await Promise.all([
      this.db.product.findMany({
        where: {
          brandId,
          brand: ACTIVE_BRAND_WHERE,
          status: ProductStatus.ACTIVE,
        },
        select: PUBLIC_PRODUCT_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.productCategory.findMany({
        where: { brandId, brand: ACTIVE_BRAND_WHERE },
        select: PUBLIC_PRODUCT_CATEGORY_SELECT,
      }),
    ]);
    return { products, categories };
  }

  private loadLocationOffers(locationId: string) {
    return this.db.productLocation.findMany({
      where: {
        locationId,
        location: ACTIVE_LOCATION_WHERE,
        status: ProductStatus.ACTIVE,
      },
      select: PUBLIC_PRODUCT_OFFER_SELECT,
    });
  }

  resolveForInventory(
    locationId: string,
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<LocationProductView[]> {
    return (tx ?? this.db).productLocation.findMany({
      where: {
        locationId,
        productId: { in: productIds },
        trackInventory: true,
        location: ACTIVE_LOCATION_WHERE,
      },
      include: locationProductInclude,
      orderBy: { id: 'asc' },
    }) as Promise<LocationProductView[]>;
  }

  resolveForSale(
    locationId: string,
    productIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<LocationProductView[]> {
    return (tx ?? this.db).productLocation.findMany({
      where: {
        locationId,
        productId: { in: productIds },
        status: ProductStatus.ACTIVE,
        location: ACTIVE_LOCATION_WHERE,
        product: { status: ProductStatus.ACTIVE },
      },
      include: locationProductInclude,
      orderBy: { id: 'asc' },
    }) as Promise<LocationProductView[]>;
  }

  private productWhere(
    brandId: string,
    filter: {
      search?: string;
      categoryId?: string;
      status?: ProductStatus;
    },
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      brand: ACTIVE_BRAND_WHERE,
      brandId,
    };
    const search = filter.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.status) where.status = filter.status;
    return where;
  }

  private locationOrder(
    field: ProductLocationSearchOrderBy,
    direction: OrderDirection,
  ): Prisma.ProductLocationOrderByWithRelationInput[] {
    const primary: Prisma.ProductLocationOrderByWithRelationInput =
      field === ProductLocationSearchOrderBy.NAME
        ? { product: { name: direction } }
        : { [field]: direction };
    return [primary, { id: direction }];
  }

  private async findCategory(
    brandId: string,
    categoryId: string,
  ): Promise<ProductCategory> {
    const category = await this.db.productCategory.findFirst({
      where: { brand: ACTIVE_BRAND_WHERE, id: categoryId, brandId },
    });
    if (!category) throw new NotFoundException('Product category not found');
    return category;
  }

  private async assertCategory(
    brandId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (categoryId) await this.findCategory(brandId, categoryId);
  }

  private rethrowProductUnique(error: any): void {
    if (error?.code !== PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) return;
    const target = String(error?.meta?.target ?? '');
    throw new AppException(
      target.includes('barcode')
        ? ErrorCode.PRODUCT_BARCODE_EXISTS
        : ErrorCode.PRODUCT_SKU_EXISTS,
      HttpStatus.CONFLICT,
    );
  }

  private rethrowUnique(
    error: any,
    code: (typeof ErrorCode)[keyof typeof ErrorCode],
  ): void {
    if (error?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
      throw new AppException(code, HttpStatus.CONFLICT);
    }
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private optionalCode(value: string | null | undefined): string | null {
    return value?.trim().toUpperCase() || null;
  }

  private changes(
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
    fields: string[],
  ): Array<{ field: string; from: unknown; to: unknown }> {
    return fields.flatMap((field) => {
      const from = oldValue?.[field] ?? null;
      const to = newValue[field] ?? null;
      return String(from) === String(to)
        ? []
        : [
            {
              field,
              from: this.auditValue(field, from),
              to: this.auditValue(field, to),
            },
          ];
    });
  }

  private auditValue(field: string, value: unknown): unknown {
    if (value == null) return null;
    if (field === 'retailPrice') {
      return MoneyUtils.format(value as Prisma.Decimal);
    }
    if (field === 'reorderLevel') {
      return QuantityUtils.format(value as Prisma.Decimal);
    }
    return value;
  }

  private emitChanges(
    brandId: string,
    locationId: string | null,
    entityId: string,
    eventType: AuditEvent,
    actor: AuditActor,
    oldValue: Record<string, unknown>,
    newValue: Record<string, unknown>,
    fields: string[],
  ): void {
    const changes = this.changes(oldValue, newValue, fields);
    if (changes.length === 0) return;
    this.emit(
      brandId,
      locationId,
      entityId,
      eventType,
      AuditActionType.MODIFY,
      actor,
      { changes },
    );
  }

  private emit(
    brandId: string,
    locationId: string | null,
    entityId: string,
    eventType: AuditEvent,
    actionType: AuditActionType,
    actor: AuditActor,
    payload: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId,
      locationId: locationId ?? undefined,
      entityType: AuditEntity.PRODUCT,
      entityId,
      eventType,
      actionType,
      occurredAt: new Date(),
      actor,
      payload,
    } satisfies AuditLogEvent);
  }
}
