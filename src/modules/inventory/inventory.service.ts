import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  InventoryBalance,
  InventoryDocument,
  InventoryDocumentStatus,
  InventoryDocumentType,
  InventoryMovement,
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { TimeService } from '../../shared/time/time.service.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../audit/constants/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../location/location.service.js';
import { ProductsService } from '../products/products.service.js';
import { InventoryDocumentDraftService } from './services/inventory-document-draft.service.js';
import { CreateInventoryDocumentDto } from './dto/create-inventory-document.dto.js';
import { InventoryDocumentSearchRequestDto } from './dto/inventory-document-search-request.dto.js';
import { InventoryDocumentStatusCountsRequestDto } from './dto/inventory-document-status-counts-request.dto.js';
import { InventoryCountsRequestDto } from './dto/inventory-counts-request.dto.js';
import { InventoryMovementSearchRequestDto } from './dto/inventory-movement-search-request.dto.js';
import { InventorySearchRequestDto } from './dto/inventory-search-request.dto.js';
import { UpdateInventoryDocumentDto } from './dto/update-inventory-document.dto.js';
import { InventoryDocumentOrderBy } from './enums/inventory-document-order-by.enum.js';
import { InventoryDocumentTargetStatus } from './enums/inventory-document-target-status.enum.js';
import { InventoryMovementOrderBy } from './enums/inventory-movement-order-by.enum.js';
import { InventorySearchOrderBy } from './enums/inventory-search-order-by.enum.js';
import { InventoryBalanceView } from './interfaces/inventory-balance-view.interface.js';
import { InventoryCountsView } from './interfaces/inventory-counts-view.interface.js';
import { InventoryDocumentStatusCount } from './interfaces/inventory-document-status-count.interface.js';
import { InventoryDocumentTransition } from './interfaces/inventory-document-transition.interface.js';
import { InventoryDocumentWithItems } from './interfaces/inventory-document-with-items.interface.js';
import { InventorySaleCost } from './interfaces/inventory-sale-cost.interface.js';
import { InventoryValuation } from './interfaces/inventory-valuation.interface.js';
import { InventorySaleLine } from './interfaces/inventory-sale-line.interface.js';
import { InventoryBalanceLockService } from './services/inventory-balance-lock.service.js';
import { InventoryComputeService } from './services/inventory-compute.service.js';
import { InventorySaleReversalService } from './services/inventory-sale-reversal.service.js';

const documentInclude = {
  items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.InventoryDocumentInclude;

const DOCUMENT_STATUSES = [
  InventoryDocumentStatus.OPEN,
  InventoryDocumentStatus.POSTED,
  InventoryDocumentStatus.VOIDED,
];

@Injectable()
export class InventoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly drafts: InventoryDocumentDraftService,
    private readonly locations: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly compute: InventoryComputeService,
    private readonly balanceLocks: InventoryBalanceLockService,
    private readonly saleReversals: InventorySaleReversalService,
  ) {}

  async createDocument(
    locationId: string,
    dto: CreateInventoryDocumentDto,
    actor: AuditActor,
  ): Promise<InventoryDocument> {
    const location = await this.locations.findById(locationId);
    const draft = await this.drafts.prepare(locationId, location.brandId, dto);
    const document = await this.db.inventoryDocument.create({
      data: {
        locationId,
        destinationLocationId: dto.destinationLocationId ?? null,
        supplierId: draft.supplierId,
        type: dto.type,
        occurredAt: new Date(dto.occurredAt),
        reference: this.text(dto.reference),
        supplierName: draft.supplierName,
        reason: this.text(dto.reason),
        note: this.text(dto.note),
        createdById: actor.id ?? null,
        createdByName: actor.name,
        items: { create: draft.items },
      },
    });
    this.emit(
      location.brandId,
      locationId,
      document.id,
      AuditEvent.INVENTORY_DOCUMENT_CREATED,
      AuditActionType.CREATE,
      actor,
      { type: document.type, itemCount: dto.items.length },
    );
    return document;
  }

  async updateDocument(
    expected: InventoryDocument,
    dto: UpdateInventoryDocumentDto,
    actor: AuditActor,
  ): Promise<InventoryDocument> {
    const { locationId, id: documentId } = expected;
    const location = await this.locations.findById(locationId);
    const document = await this.inTransaction(async (tx) => {
      await this.lockDocument(tx, documentId);
      const old = await this.findDocumentInTransaction(
        tx,
        locationId,
        documentId,
      );
      this.assertCurrentDocument(old, expected);
      this.assertOpen(old.status);
      const draft = await this.drafts.prepare(
        locationId,
        location.brandId,
        dto,
        old.items,
        tx,
      );
      await tx.inventoryDocumentItem.deleteMany({ where: { documentId } });
      return tx.inventoryDocument.update({
        where: { id: documentId },
        data: {
          destinationLocationId: dto.destinationLocationId ?? null,
          supplierId: draft.supplierId,
          type: dto.type,
          occurredAt: new Date(dto.occurredAt),
          reference: this.text(dto.reference),
          supplierName: draft.supplierName,
          reason: this.text(dto.reason),
          note: this.text(dto.note),
          items: { create: draft.items },
        },
      });
    });
    this.emit(
      location.brandId,
      locationId,
      document.id,
      AuditEvent.INVENTORY_DOCUMENT_UPDATED,
      AuditActionType.MODIFY,
      actor,
      { type: document.type, itemCount: dto.items.length },
    );
    return document;
  }

  async changeDocumentStatus(
    expected: InventoryDocument,
    status: InventoryDocumentTargetStatus,
    actor: AuditActor,
  ): Promise<InventoryDocumentWithItems> {
    const { locationId } = expected;
    const location = await this.locations.findById(locationId);
    const transition =
      status === InventoryDocumentTargetStatus.POSTED
        ? await this.postDocument(expected)
        : await this.voidDocument(expected);
    if (transition.changed) {
      this.emit(
        location.brandId,
        locationId,
        transition.document.id,
        status === InventoryDocumentTargetStatus.POSTED
          ? AuditEvent.INVENTORY_DOCUMENT_POSTED
          : AuditEvent.INVENTORY_DOCUMENT_VOIDED,
        AuditActionType.ACTION,
        actor,
        {
          type: transition.document.type,
          status: transition.document.status,
        },
      );
    }
    return transition.document;
  }

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
    return DOCUMENT_STATUSES.map((status) => ({
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

  async postSale(
    locationId: string,
    orderId: string,
    occurredAt: Date,
    lines: InventorySaleLine[],
    tx: Prisma.TransactionClient,
  ): Promise<InventorySaleCost[]> {
    const tracked = lines.filter((line) => line.trackInventory);
    const costs = new Map<string, InventorySaleCost>(
      lines.map((line) => [
        line.orderItemId,
        { orderItemId: line.orderItemId, unitCost: null, lineCost: null },
      ]),
    );
    if (tracked.length === 0) return [...costs.values()];
    const balances = await this.balanceLocks.lock(
      tx,
      tracked.map((line) => line.productLocationId),
    );
    for (const line of tracked) {
      const balance = balances.get(line.productLocationId)!;
      const quantity = new Prisma.Decimal(line.quantity);
      const unitCost = balance.averageUnitCost;
      const next = this.compute.nextState(
        {
          quantity: balance.quantityOnHand,
          averageUnitCost: balance.averageUnitCost,
          stockValue: balance.stockValue,
        },
        quantity.neg(),
        unitCost,
      );
      const lineCost = next.totalCost.neg();
      const averageUnitCostAfter = next.averageUnitCost;
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          quantityOnHand: next.quantity,
          averageUnitCost: averageUnitCostAfter,
          stockValue: next.stockValue,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          locationId,
          productLocationId: line.productLocationId,
          orderId,
          orderItemId: line.orderItemId,
          sourceType: InventoryMovementSourceType.ORDER,
          sourceId: orderId,
          sourceLocationId: locationId,
          type: InventoryMovementType.SALE,
          productId: line.productId,
          productName: line.productName,
          productSku: line.productSku,
          quantityDelta: quantity.neg(),
          quantityBefore: balance.quantityOnHand,
          quantityAfter: next.quantity,
          averageUnitCostBefore: balance.averageUnitCost,
          averageUnitCostAfter,
          stockValueBefore: balance.stockValue,
          stockValueAfter: next.stockValue,
          unitCost,
          totalCost: lineCost.neg(),
          occurredAt,
          idempotencyKey: `order:${orderId}:item:${line.orderItemId}:sale`,
        },
      });
      balance.quantityOnHand = next.quantity;
      balance.averageUnitCost = averageUnitCostAfter;
      balance.stockValue = next.stockValue;
      costs.set(line.orderItemId, {
        orderItemId: line.orderItemId,
        unitCost,
        lineCost,
      });
    }
    return [...costs.values()];
  }

  async reverseSale(
    locationId: string,
    orderId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.saleReversals.reverse(locationId, orderId, occurredAt, tx);
  }

  async reverseSaleItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.saleReversals.reverse(
      locationId,
      orderId,
      occurredAt,
      tx,
      orderItemId,
    );
  }

  async reverseSaleItemQuantity(
    locationId: string,
    orderId: string,
    orderItemId: string,
    quantity: Prisma.Decimal,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
    orderReturnItemId?: string,
  ): Promise<void> {
    await this.saleReversals.reverse(
      locationId,
      orderId,
      occurredAt,
      tx,
      orderItemId,
      new Map([[orderItemId, quantity]]),
      orderReturnItemId
        ? new Map([[orderItemId, orderReturnItemId]])
        : new Map(),
    );
  }

  private async postDocument(
    expected: InventoryDocument,
  ): Promise<InventoryDocumentTransition> {
    const { locationId, id: documentId } = expected;
    return this.inTransaction(async (tx) => {
      await this.lockDocument(tx, documentId);
      const document = await this.findDocumentInTransaction(
        tx,
        locationId,
        documentId,
      );
      this.assertCurrentDocument(document, expected);
      await this.assertDocumentBusinessesActive(document, tx);
      if (document.status === InventoryDocumentStatus.POSTED) {
        return { document, changed: false };
      }
      this.assertOpen(document.status);

      const destinationRows =
        document.type === InventoryDocumentType.TRANSFER
          ? await this.resolveTransferDestination(document, tx)
          : [];
      const destinationByProduct = new Map(
        destinationRows.map((row) => [row.productId, row]),
      );
      const balanceIds = [
        ...document.items.map((item) => item.productLocationId),
        ...destinationRows.map((row) => row.id),
      ];
      const balances = await this.balanceLocks.lock(tx, balanceIds);

      for (const item of document.items) {
        const source = balances.get(item.productLocationId)!;
        if (document.type === InventoryDocumentType.TRANSFER) {
          const destination = destinationByProduct.get(item.productId)!;
          const unitCost = source.averageUnitCost;
          const outgoing = await this.applyMovement(
            tx,
            source,
            item,
            document,
            item.quantity.neg(),
            unitCost,
            InventoryMovementType.TRANSFER_OUT,
          );
          await this.applyMovement(
            tx,
            balances.get(destination.id)!,
            item,
            document,
            item.quantity,
            unitCost,
            InventoryMovementType.TRANSFER_IN,
            outgoing.totalCost.neg(),
          );
          continue;
        }
        const delta = this.compute.documentDelta(document.type, item.quantity);
        const unitCost = this.movementUnitCost(
          document.type,
          item.unitCost,
          source,
          delta,
        );
        await this.applyMovement(
          tx,
          source,
          item,
          document,
          delta,
          unitCost,
          this.movementType(document.type),
          delta.gt(0) ? (item.totalCost ?? undefined) : undefined,
        );
      }
      const posted = await tx.inventoryDocument.update({
        where: { id: documentId },
        data: { status: InventoryDocumentStatus.POSTED, postedAt: new Date() },
        include: documentInclude,
      });
      return { document: posted, changed: true };
    });
  }

  private async voidDocument(
    expected: InventoryDocument,
  ): Promise<InventoryDocumentTransition> {
    const { locationId, id: documentId } = expected;
    return this.inTransaction(async (tx) => {
      await this.lockDocument(tx, documentId);
      const document = await this.findDocumentInTransaction(
        tx,
        locationId,
        documentId,
      );
      this.assertCurrentDocument(document, expected);
      await this.assertDocumentBusinessesActive(document, tx);
      if (document.status === InventoryDocumentStatus.VOIDED) {
        return { document, changed: false };
      }
      if (document.status === InventoryDocumentStatus.OPEN) {
        const voided = await tx.inventoryDocument.update({
          where: { id: documentId },
          data: {
            status: InventoryDocumentStatus.VOIDED,
            voidedAt: new Date(),
          },
          include: documentInclude,
        });
        return { document: voided, changed: true };
      }
      const movements = await tx.inventoryMovement.findMany({
        where: { documentId, reversedMovementId: null },
        orderBy: { sequence: 'desc' },
      });
      const balances = await this.balanceLocks.lock(
        tx,
        movements.map((movement) => movement.productLocationId),
      );
      const checked = new Set<string>();
      for (const movement of movements) {
        if (checked.has(movement.productLocationId)) continue;
        checked.add(movement.productLocationId);
        const balance = balances.get(movement.productLocationId)!;
        const latest = await tx.inventoryMovement.findFirst({
          where: { productLocationId: movement.productLocationId },
          orderBy: { sequence: 'desc' },
        });
        if (
          latest?.id !== movement.id ||
          !balance.quantityOnHand.equals(movement.quantityAfter) ||
          !balance.averageUnitCost.equals(movement.averageUnitCostAfter) ||
          !balance.stockValue.equals(movement.stockValueAfter)
        ) {
          throw new AppException(
            ErrorCode.INVENTORY_REVERSAL_NOT_ALLOWED,
            HttpStatus.CONFLICT,
          );
        }
      }
      for (const movement of movements) {
        const balance = balances.get(movement.productLocationId)!;
        const delta = movement.quantityBefore.minus(balance.quantityOnHand);
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            quantityOnHand: movement.quantityBefore,
            averageUnitCost: movement.averageUnitCostBefore,
            stockValue: movement.stockValueBefore,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            locationId: movement.locationId,
            productLocationId: movement.productLocationId,
            documentId,
            documentItemId: movement.documentItemId,
            sourceType: InventoryMovementSourceType.INVENTORY_DOCUMENT,
            sourceId: documentId,
            sourceLocationId: document.locationId,
            type: InventoryMovementType.REVERSAL,
            productId: movement.productId,
            productName: movement.productName,
            productSku: movement.productSku,
            quantityDelta: delta,
            quantityBefore: balance.quantityOnHand,
            quantityAfter: movement.quantityBefore,
            averageUnitCostBefore: balance.averageUnitCost,
            averageUnitCostAfter: movement.averageUnitCostBefore,
            stockValueBefore: balance.stockValue,
            stockValueAfter: movement.stockValueBefore,
            unitCost: movement.unitCost,
            totalCost: movement.totalCost.neg(),
            occurredAt: new Date(),
            idempotencyKey: `${documentId}:void:${movement.id}`,
            reversedMovementId: movement.id,
          },
        });
        balance.quantityOnHand = movement.quantityBefore;
        balance.averageUnitCost = movement.averageUnitCostBefore;
        balance.stockValue = movement.stockValueBefore;
      }
      const voided = await tx.inventoryDocument.update({
        where: { id: documentId },
        data: { status: InventoryDocumentStatus.VOIDED, voidedAt: new Date() },
        include: documentInclude,
      });
      return { document: voided, changed: true };
    });
  }

  private async applyMovement(
    tx: Prisma.TransactionClient,
    balance: InventoryBalance,
    item: InventoryDocumentWithItems['items'][number],
    document: InventoryDocumentWithItems,
    delta: Prisma.Decimal,
    unitCost: Prisma.Decimal,
    type: InventoryMovementType,
    exactTotalCost?: Prisma.Decimal,
  ): Promise<InventoryValuation> {
    const next = this.compute.nextState(
      {
        quantity: balance.quantityOnHand,
        averageUnitCost: balance.averageUnitCost,
        stockValue: balance.stockValue,
      },
      delta,
      unitCost,
      exactTotalCost,
    );
    const averageUnitCostAfter = next.averageUnitCost;
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        quantityOnHand: next.quantity,
        averageUnitCost: averageUnitCostAfter,
        stockValue: next.stockValue,
      },
    });
    await tx.inventoryMovement.create({
      data: {
        locationId:
          balance.productLocationId === item.productLocationId
            ? document.locationId
            : document.destinationLocationId!,
        productLocationId: balance.productLocationId,
        documentId: document.id,
        documentItemId: item.id,
        sourceType: InventoryMovementSourceType.INVENTORY_DOCUMENT,
        sourceId: document.id,
        sourceLocationId: document.locationId,
        type,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantityDelta: delta,
        quantityBefore: balance.quantityOnHand,
        quantityAfter: next.quantity,
        averageUnitCostBefore: balance.averageUnitCost,
        averageUnitCostAfter,
        stockValueBefore: balance.stockValue,
        stockValueAfter: next.stockValue,
        unitCost,
        totalCost: next.totalCost,
        occurredAt: document.occurredAt,
        idempotencyKey: `${document.id}:post:${item.id}:${balance.productLocationId}`,
      },
    });
    balance.quantityOnHand = next.quantity;
    balance.averageUnitCost = averageUnitCostAfter;
    balance.stockValue = next.stockValue;
    return next;
  }

  private movementUnitCost(
    type: InventoryDocumentType,
    itemCost: Prisma.Decimal | null,
    balance: InventoryBalance,
    delta: Prisma.Decimal,
  ): Prisma.Decimal {
    if (
      type === InventoryDocumentType.RECEIPT ||
      (type === InventoryDocumentType.ADJUSTMENT && delta.gt(0))
    ) {
      return itemCost!;
    }
    return balance.averageUnitCost;
  }

  private movementType(type: InventoryDocumentType): InventoryMovementType {
    const types: Record<InventoryDocumentType, InventoryMovementType> = {
      RECEIPT: InventoryMovementType.RECEIPT,
      WRITE_OFF: InventoryMovementType.WRITE_OFF,
      ADJUSTMENT: InventoryMovementType.ADJUSTMENT,
      TRANSFER: InventoryMovementType.TRANSFER_OUT,
    };
    return types[type];
  }

  private assertCurrentDocument(
    current: InventoryDocument,
    expected: InventoryDocument,
  ): void {
    if (
      current.updatedAt.getTime() !== expected.updatedAt.getTime() ||
      current.destinationLocationId !== expected.destinationLocationId ||
      current.status !== expected.status
    )
      throw new AppException(
        ErrorCode.INVENTORY_DOCUMENT_CONCURRENT_UPDATE,
        HttpStatus.CONFLICT,
      );
  }

  private lockDocument(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<unknown> {
    return tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "InventoryDocument" WHERE "id" = ${documentId} FOR UPDATE
    `);
  }

  private async findDocumentInTransaction(
    tx: Prisma.TransactionClient,
    locationId: string,
    documentId: string,
  ): Promise<InventoryDocumentWithItems> {
    const document = await tx.inventoryDocument.findFirst({
      where: { id: documentId, locationId },
      include: documentInclude,
    });
    if (!document) throw new NotFoundException('Inventory document not found');
    return document;
  }

  private async resolveTransferDestination(
    document: InventoryDocumentWithItems,
    tx: Prisma.TransactionClient,
  ) {
    if (!document.destinationLocationId) {
      throw new AppException(
        ErrorCode.INVENTORY_DESTINATION_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productIds = [
      ...new Set(document.items.map((item) => item.productId)),
    ];
    const rows = await this.products.resolveForInventory(
      document.destinationLocationId,
      productIds,
      tx,
    );
    if (rows.length !== productIds.length) {
      throw new AppException(
        ErrorCode.INVENTORY_PRODUCT_NOT_CONFIGURED,
        HttpStatus.BAD_REQUEST,
      );
    }
    return rows;
  }

  private async assertDocumentBusinessesActive(
    document: InventoryDocumentWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const locationIds = [
      ...new Set([
        document.locationId,
        ...(document.destinationLocationId
          ? [document.destinationLocationId]
          : []),
      ]),
    ].sort();
    for (const locationId of locationIds) {
      if (!(await this.locations.acquireActiveOperationLock(locationId, tx))) {
        throw new NotFoundException('Location not found');
      }
    }
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

    const from = dto.from ? TimeService.dateOnly(dto.from) : undefined;
    const to = dto.to
      ? TimeService.dateOnly(TimeService.addDaysStr(dto.to, 1))
      : undefined;
    if (from && to && from >= to) {
      throw new BadRequestException('Invalid date range');
    }

    return { gte: from, lt: to };
  }

  private assertOpen(status: InventoryDocumentStatus): void {
    if (status !== InventoryDocumentStatus.OPEN) {
      throw new AppException(
        ErrorCode.INVENTORY_DOCUMENT_NOT_OPEN,
        HttpStatus.CONFLICT,
      );
    }
  }

  private inTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(operation, {
      maxWait: 5_000,
      timeout: 30_000,
    });
  }

  private text(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private emit(
    brandId: string,
    locationId: string,
    entityId: string,
    eventType: AuditEvent,
    actionType: AuditActionType,
    actor: AuditActor,
    payload: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId,
      locationId,
      entityType: AuditEntity.INVENTORY,
      entityId,
      eventType,
      actionType,
      occurredAt: new Date(),
      actor,
      payload,
    } satisfies AuditLogEvent);
  }
}
