import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryDocumentStatus,
  InventoryDocumentType,
  InventoryMovement,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { stableOrderBy } from '../../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../../shared/enums/order-direction.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { ProductsService } from '../../products/services/products.service.js';
import { documentInclude } from '../constants/inventory-document.include.js';
import { InventoryCountsRequestDto } from '../dto/inventory-counts-request.dto.js';
import { InventoryDocumentSearchRequestDto } from '../dto/inventory-document-search-request.dto.js';
import { InventoryDocumentStatusCountsRequestDto } from '../dto/inventory-document-status-counts-request.dto.js';
import { InventoryMovementSearchRequestDto } from '../dto/inventory-movement-search-request.dto.js';
import { InventorySearchRequestDto } from '../dto/inventory-search-request.dto.js';
import { InventoryDocumentOrderBy } from '../enums/inventory-document-order-by.enum.js';
import { InventoryMovementOrderBy } from '../enums/inventory-movement-order-by.enum.js';
import { InventorySearchOrderBy } from '../enums/inventory-search-order-by.enum.js';
import { InventoryBalanceView } from '../interfaces/inventory-balance-view.interface.js';
import { InventoryCountsView } from '../interfaces/inventory-counts-view.interface.js';
import { InventoryDocumentStatusCount } from '../interfaces/inventory-document-status-count.interface.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';

@Injectable()
export class InventoryReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
  ) {}
  async findDocument(
    locationId: string,
    documentId: string,
  ): Promise<InventoryDocumentWithItems> {
    const document = await this.db.inventoryDocument.findFirst({
      where: { id: documentId, locationId },
      include: documentInclude,
    });
    if (!document) throw new NotFoundException('Inventory document not found');
    return document;
  }

  async searchDocuments(
    locationId: string,
    dto: InventoryDocumentSearchRequestDto,
  ): Promise<PaginatedResult<InventoryDocumentWithItems>> {
    const where = this.documentWhere(locationId, dto);
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.InventoryDocumentFindManyArgs = {
      where,
      include: documentInclude,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? InventoryDocumentOrderBy.OCCURRED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.inventoryDocument.findMany(args),
      this.db.inventoryDocument.count({ where }),
    ]);
    return { items: items as InventoryDocumentWithItems[], totalItems };
  }

  async getDocumentStatusCounts(
    locationId: string,
    dto: InventoryDocumentStatusCountsRequestDto,
  ): Promise<InventoryDocumentStatusCount[]> {
    const rows = await this.db.inventoryDocument.groupBy({
      by: ['status'],
      where: this.documentWhere(locationId, dto),
      _count: { _all: true },
    });
    const byStatus = new Map(rows.map((row) => [row.status, row._count._all]));
    return [
      InventoryDocumentStatus.OPEN,
      InventoryDocumentStatus.POSTED,
      InventoryDocumentStatus.VOIDED,
    ].map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    }));
  }

  async searchInventory(
    locationId: string,
    dto: InventorySearchRequestDto,
  ): Promise<PaginatedResult<InventoryBalanceView>> {
    let items = await this.getInventoryBalanceViews(
      locationId,
      dto.search,
      dto.productIds,
    );
    if (dto.lowStock !== undefined) {
      items = items.filter((item) => item.lowStock === dto.lowStock);
    }
    if (dto.outOfStock !== undefined) {
      items = items.filter((item) => item.outOfStock === dto.outOfStock);
    }
    this.sortInventory(items, dto);
    const totalItems = items.length;
    if (!dto.isExport) {
      items = items.slice(
        (dto.page - 1) * dto.pageSize,
        dto.page * dto.pageSize,
      );
    }
    return { items, totalItems };
  }

  async getInventoryCounts(
    locationId: string,
    dto: InventoryCountsRequestDto,
  ): Promise<InventoryCountsView> {
    const items = await this.getInventoryBalanceViews(
      locationId,
      dto.search,
      dto.productIds,
    );
    return {
      lowStockCount: items.filter((item) => item.lowStock).length,
      outOfStockCount: items.filter((item) => item.outOfStock).length,
    };
  }

  private async getInventoryBalanceViews(
    locationId: string,
    searchValue?: string,
    productIds?: string[],
  ): Promise<InventoryBalanceView[]> {
    const locationProducts =
      await this.products.listTrackedForInventory(locationId);
    const balances = await this.db.inventoryBalance.findMany({
      where: {
        productLocationId: { in: locationProducts.map((row) => row.id) },
      },
    });
    const byProductLocation = new Map(
      balances.map((balance) => [balance.productLocationId, balance]),
    );
    const zero = new Prisma.Decimal(0);
    const search = searchValue?.trim().toLocaleLowerCase();
    let items = locationProducts.map((row): InventoryBalanceView => {
      const balance = byProductLocation.get(row.id);
      const quantity = balance?.quantityOnHand ?? zero;
      const averageCost = balance?.averageUnitCost ?? zero;
      return {
        productLocationId: row.id,
        productId: row.productId,
        name: row.product.name,
        sku: row.product.sku,
        barcode: row.product.barcode,
        unit: row.product.unit,
        quantityOnHand: quantity,
        averageUnitCost: averageCost,
        stockValue: balance?.stockValue ?? zero,
        reorderLevel: row.reorderLevel,
        lowStock: quantity.lte(row.reorderLevel),
        outOfStock: quantity.lte(zero),
        updatedAt: balance?.updatedAt ?? null,
      };
    });
    if (productIds?.length) {
      const selected = new Set(productIds);
      items = items.filter((item) => selected.has(item.productId));
    }
    if (search) {
      items = items.filter((item) =>
        [item.name, item.sku, item.barcode].some((value) =>
          value?.toLocaleLowerCase().includes(search),
        ),
      );
    }
    return items;
  }

  async searchMovements(
    locationId: string,
    productId: string,
    dto: InventoryMovementSearchRequestDto,
  ): Promise<PaginatedResult<InventoryMovement>> {
    const [productLocation] = await this.products.resolveForInventory(
      locationId,
      [productId],
    );
    if (!productLocation) {
      throw new AppException(
        ErrorCode.INVENTORY_PRODUCT_NOT_CONFIGURED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const where: Prisma.InventoryMovementWhereInput = {
      locationId,
      productLocationId: productLocation.id,
      type: dto.type,
      occurredAt: this.occurredAtDateWhere(dto),
    };
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.InventoryMovementFindManyArgs = {
      where,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? InventoryMovementOrderBy.OCCURRED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.inventoryMovement.findMany(args),
      this.db.inventoryMovement.count({ where }),
    ]);
    return { items, totalItems };
  }

  private sortInventory(
    items: InventoryBalanceView[],
    dto: InventorySearchRequestDto,
  ): void {
    const field = dto.orderBy ?? InventorySearchOrderBy.NAME;
    const factor =
      (dto.orderDirection ?? OrderDirection.ASC) === OrderDirection.ASC
        ? 1
        : -1;
    items.sort((left, right) => {
      let result: number;
      if (field === InventorySearchOrderBy.NAME) {
        result = left.name.localeCompare(right.name);
      } else if (field === InventorySearchOrderBy.UPDATED_AT) {
        result =
          (left.updatedAt?.getTime() ?? 0) - (right.updatedAt?.getTime() ?? 0);
      } else {
        result = left[field].comparedTo(right[field]);
      }
      return result === 0
        ? left.productLocationId.localeCompare(right.productLocationId)
        : result * factor;
    });
  }

  private documentWhere(
    locationId: string,
    filter: {
      type?: InventoryDocumentType;
      status?: InventoryDocumentStatus;
      from?: string;
      to?: string;
      supplierId?: string;
    },
  ): Prisma.InventoryDocumentWhereInput {
    const occurredAt = this.occurredAtDateWhere(filter);
    return {
      locationId,
      type: filter.type,
      status: filter.status,
      supplierId: filter.supplierId,
      ...(occurredAt ? { occurredAt } : {}),
    };
  }

  private occurredAtDateWhere(
    dto: Pick<InventoryMovementSearchRequestDto, 'from' | 'to'>,
  ): Prisma.DateTimeFilter | undefined {
    if (!dto.from && !dto.to) return undefined;

    const from = dto.from ? TimeUtils.dateOnly(dto.from) : undefined;
    const to = dto.to
      ? TimeUtils.dateOnly(TimeUtils.addDaysStr(dto.to, 1))
      : undefined;
    if (from && to && from >= to) {
      throw new BadRequestException('Invalid date range');
    }

    return { gte: from, lt: to };
  }
}
