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
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
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
import { InventoryBalanceView } from '../interfaces/inventory-balance-view.interface.js';
import { InventoryCountsView } from '../interfaces/inventory-counts-view.interface.js';
import { InventoryDocumentStatusCount } from '../interfaces/inventory-document-status-count.interface.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryStockReadService } from './inventory-stock-read.service.js';

@Injectable()
export class InventoryReadService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly stock: InventoryStockReadService,
  ) {}
  async findDocument(
    locationId: string,
    documentId: string,
  ): Promise<InventoryDocumentWithItems> {
    const document = await this.db.inventoryDocument.findFirst({
      where: { location: ACTIVE_LOCATION_WHERE, id: documentId, locationId },
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

  searchInventory(
    locationId: string,
    dto: InventorySearchRequestDto,
  ): Promise<PaginatedResult<InventoryBalanceView>> {
    return this.stock.search(locationId, dto);
  }
  getInventoryCounts(
    locationId: string,
    dto: InventoryCountsRequestDto,
  ): Promise<InventoryCountsView> {
    return this.stock.counts(locationId, dto);
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
      location: ACTIVE_LOCATION_WHERE,
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
      location: ACTIVE_LOCATION_WHERE,
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
