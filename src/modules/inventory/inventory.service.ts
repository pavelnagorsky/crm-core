import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  InventoryBalance,
  InventoryDocumentStatus,
  InventoryDocumentType,
  InventoryMovement,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../location/location.service.js';
import { ProductsService } from '../products/products.service.js';
import { CreateInventoryDocumentDto } from './dto/create-inventory-document.dto.js';
import { InventoryDocumentSearchRequestDto } from './dto/inventory-document-search-request.dto.js';
import { InventoryMovementSearchRequestDto } from './dto/inventory-movement-search-request.dto.js';
import { InventorySearchRequestDto } from './dto/inventory-search-request.dto.js';
import { InventoryDocumentItemDto } from './dto/inventory-document-item.dto.js';
import { UpdateInventoryDocumentDto } from './dto/update-inventory-document.dto.js';
import { InventoryDocumentOrderBy } from './enums/inventory-document-order-by.enum.js';
import { InventoryDocumentTargetStatus } from './enums/inventory-document-target-status.enum.js';
import { InventoryMovementOrderBy } from './enums/inventory-movement-order-by.enum.js';
import { InventorySearchOrderBy } from './enums/inventory-search-order-by.enum.js';
import { InventoryBalanceView } from './interfaces/inventory-balance-view.interface.js';
import { InventoryDocumentTransition } from './interfaces/inventory-document-transition.interface.js';
import { InventoryDocumentWithItems } from './interfaces/inventory-document-with-items.interface.js';
import { InventorySaleCost } from './interfaces/inventory-sale-cost.interface.js';
import { InventorySaleLine } from './interfaces/inventory-sale-line.interface.js';
import { InventoryComputeService } from './inventory-compute.service.js';

const documentInclude = {
  items: { orderBy: [{ productName: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.InventoryDocumentInclude;

type Transaction = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly locations: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly compute: InventoryComputeService,
  ) {}

  async createDocument(
    locationId: string,
    dto: CreateInventoryDocumentDto,
    actor: AuditActor,
  ): Promise<InventoryDocumentWithItems> {
    const location = await this.locations.findById(locationId);
    const resolved = await this.validateDraft(
      locationId,
      location.brandId,
      dto,
    );
    const document = await this.db.inventoryDocument.create({
      data: {
        locationId,
        destinationLocationId: dto.destinationLocationId ?? null,
        type: dto.type,
        occurredAt: new Date(dto.occurredAt),
        reference: this.text(dto.reference),
        supplierName: this.text(dto.supplierName),
        reason: this.text(dto.reason),
        note: this.text(dto.note),
        createdById: actor.id ?? null,
        createdByName: actor.name,
        items: { create: this.itemData(dto.items, resolved) },
      },
      include: documentInclude,
    });
    this.emit(
      location.brandId,
      locationId,
      document.id,
      AuditEvent.INVENTORY_DOCUMENT_CREATED,
      AuditActionType.CREATE,
      actor,
      { type: document.type, itemCount: document.items.length },
    );
    return document;
  }

  async updateDocument(
    locationId: string,
    documentId: string,
    dto: UpdateInventoryDocumentDto,
    actor: AuditActor,
  ): Promise<InventoryDocumentWithItems> {
    const location = await this.locations.findById(locationId);
    const resolved = await this.validateDraft(
      locationId,
      location.brandId,
      dto,
    );
    const document = await this.inTransaction(async (tx) => {
      await this.lockDocument(tx, documentId);
      const old = await this.findDocumentInTransaction(
        tx,
        locationId,
        documentId,
      );
      this.assertOpen(old.status);
      await tx.inventoryDocumentItem.deleteMany({ where: { documentId } });
      return tx.inventoryDocument.update({
        where: { id: documentId },
        data: {
          destinationLocationId: dto.destinationLocationId ?? null,
          type: dto.type,
          occurredAt: new Date(dto.occurredAt),
          reference: this.text(dto.reference),
          supplierName: this.text(dto.supplierName),
          reason: this.text(dto.reason),
          note: this.text(dto.note),
          items: { create: this.itemData(dto.items, resolved) },
        },
        include: documentInclude,
      });
    });
    this.emit(
      location.brandId,
      locationId,
      document.id,
      AuditEvent.INVENTORY_DOCUMENT_UPDATED,
      AuditActionType.MODIFY,
      actor,
      { type: document.type, itemCount: document.items.length },
    );
    return document;
  }

  async changeDocumentStatus(
    locationId: string,
    documentId: string,
    status: InventoryDocumentTargetStatus,
    actor: AuditActor,
  ): Promise<InventoryDocumentWithItems> {
    const location = await this.locations.findById(locationId);
    const transition =
      status === InventoryDocumentTargetStatus.POSTED
        ? await this.postDocument(locationId, documentId)
        : await this.voidDocument(locationId, documentId);
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
    const where: Prisma.InventoryDocumentWhereInput = {
      locationId,
      type: dto.type,
      status: dto.status,
    };
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

  async searchInventory(
    locationId: string,
    dto: InventorySearchRequestDto,
  ): Promise<PaginatedResult<InventoryBalanceView>> {
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
    const search = dto.search?.trim().toLocaleLowerCase();
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
        stockValue: MoneyService.quantize(quantity.mul(averageCost)),
        reorderLevel: row.reorderLevel,
        lowStock: quantity.lte(row.reorderLevel),
        updatedAt: balance?.updatedAt ?? null,
      };
    });
    if (search) {
      items = items.filter((item) =>
        [item.name, item.sku, item.barcode].some((value) =>
          value?.toLocaleLowerCase().includes(search),
        ),
      );
    }
    if (dto.lowStock !== undefined) {
      items = items.filter((item) => item.lowStock === dto.lowStock);
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
      occurredAt:
        dto.from || dto.to
          ? {
              gte: dto.from ? new Date(dto.from) : undefined,
              lte: dto.to ? new Date(dto.to) : undefined,
            }
          : undefined,
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
    const balances = await this.lockBalances(
      tx,
      tracked.map((line) => line.productLocationId),
    );
    for (const line of tracked) {
      const balance = balances.get(line.productLocationId)!;
      const quantity = new Prisma.Decimal(line.quantity);
      const quantityAfter = balance.quantityOnHand.minus(quantity);
      if (quantityAfter.isNegative()) {
        throw new AppException(
          ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
          HttpStatus.CONFLICT,
        );
      }
      const unitCost = balance.averageUnitCost;
      const lineCost = MoneyService.quantize(quantity.mul(unitCost));
      const averageUnitCostAfter = quantityAfter.isZero()
        ? new Prisma.Decimal(0)
        : unitCost;
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          quantityOnHand: quantityAfter,
          averageUnitCost: averageUnitCostAfter,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          locationId,
          productLocationId: line.productLocationId,
          orderId,
          orderItemId: line.orderItemId,
          type: InventoryMovementType.SALE,
          productId: line.productId,
          productName: line.productName,
          productSku: line.productSku,
          quantityDelta: quantity.neg(),
          quantityBefore: balance.quantityOnHand,
          quantityAfter,
          averageUnitCostBefore: balance.averageUnitCost,
          averageUnitCostAfter,
          unitCost,
          totalCost: lineCost.neg(),
          occurredAt,
          idempotencyKey: `order:${orderId}:item:${line.orderItemId}:sale`,
        },
      });
      balance.quantityOnHand = quantityAfter;
      balance.averageUnitCost = averageUnitCostAfter;
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
    await this.reverseSaleMovements(locationId, orderId, occurredAt, tx);
  }

  async reverseSaleItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.reverseSaleMovements(
      locationId,
      orderId,
      occurredAt,
      tx,
      orderItemId,
    );
  }

  private async reverseSaleMovements(
    locationId: string,
    orderId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
    orderItemId?: string,
  ): Promise<void> {
    const originals = await tx.inventoryMovement.findMany({
      where: {
        locationId,
        orderId,
        orderItemId,
        type: InventoryMovementType.SALE,
      },
      orderBy: { productLocationId: 'asc' },
    });
    if (originals.length === 0) return;
    const existing = await tx.inventoryMovement.findMany({
      where: { reversedMovementId: { in: originals.map((row) => row.id) } },
      select: { reversedMovementId: true },
    });
    const reversedIds = new Set(existing.map((row) => row.reversedMovementId));
    const pending = originals.filter((row) => !reversedIds.has(row.id));
    if (pending.length === 0) return;
    const balances = await this.lockBalances(
      tx,
      pending.map((row) => row.productLocationId),
    );
    for (const movement of pending) {
      const balance = balances.get(movement.productLocationId)!;
      const quantity = movement.quantityDelta.neg();
      const next = this.compute.nextState(
        {
          quantity: balance.quantityOnHand,
          averageUnitCost: balance.averageUnitCost,
        },
        quantity,
        movement.unitCost,
      );
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          quantityOnHand: next.quantity,
          averageUnitCost: next.averageUnitCost,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          locationId,
          productLocationId: movement.productLocationId,
          orderId,
          orderItemId: movement.orderItemId,
          type: InventoryMovementType.SALE_REVERSAL,
          productId: movement.productId,
          productName: movement.productName,
          productSku: movement.productSku,
          quantityDelta: quantity,
          quantityBefore: balance.quantityOnHand,
          quantityAfter: next.quantity,
          averageUnitCostBefore: balance.averageUnitCost,
          averageUnitCostAfter: next.averageUnitCost,
          unitCost: movement.unitCost,
          totalCost: MoneyService.quantize(quantity.mul(movement.unitCost)),
          occurredAt,
          idempotencyKey: `order:${orderId}:item:${movement.orderItemId}:sale-reversal`,
          reversedMovementId: movement.id,
        },
      });
      balance.quantityOnHand = next.quantity;
      balance.averageUnitCost = next.averageUnitCost;
    }
  }

  private async postDocument(
    locationId: string,
    documentId: string,
  ): Promise<InventoryDocumentTransition> {
    return this.inTransaction(async (tx) => {
      await this.lockDocument(tx, documentId);
      const document = await this.findDocumentInTransaction(
        tx,
        locationId,
        documentId,
      );
      if (document.status === InventoryDocumentStatus.POSTED) {
        return { document, changed: false };
      }
      this.assertOpen(document.status);

      const destinationRows =
        document.type === InventoryDocumentType.TRANSFER
          ? await this.resolveTransferDestination(document)
          : [];
      const destinationByProduct = new Map(
        destinationRows.map((row) => [row.productId, row]),
      );
      const balanceIds = [
        ...document.items.map((item) => item.productLocationId),
        ...destinationRows.map((row) => row.id),
      ];
      const balances = await this.lockBalances(tx, balanceIds);

      for (const item of document.items) {
        const source = balances.get(item.productLocationId)!;
        if (document.type === InventoryDocumentType.TRANSFER) {
          const destination = destinationByProduct.get(item.productId)!;
          const unitCost = source.averageUnitCost;
          await this.applyMovement(
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
          );
          continue;
        }
        const delta = this.compute.documentDelta(
          document.type,
          item.quantity,
          source.quantityOnHand,
        );
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
    locationId: string,
    documentId: string,
  ): Promise<InventoryDocumentTransition> {
    return this.inTransaction(async (tx) => {
      await this.lockDocument(tx, documentId);
      const document = await this.findDocumentInTransaction(
        tx,
        locationId,
        documentId,
      );
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
        orderBy: { createdAt: 'desc' },
      });
      const balances = await this.lockBalances(
        tx,
        movements.map((movement) => movement.productLocationId),
      );
      for (const movement of movements) {
        const balance = balances.get(movement.productLocationId)!;
        const latest = await tx.inventoryMovement.findFirst({
          where: { productLocationId: movement.productLocationId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (
          latest?.id !== movement.id ||
          !balance.quantityOnHand.equals(movement.quantityAfter) ||
          !balance.averageUnitCost.equals(movement.averageUnitCostAfter)
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
          },
        });
        await tx.inventoryMovement.create({
          data: {
            locationId: movement.locationId,
            productLocationId: movement.productLocationId,
            documentId,
            documentItemId: movement.documentItemId,
            type: InventoryMovementType.REVERSAL,
            productId: movement.productId,
            productName: movement.productName,
            productSku: movement.productSku,
            quantityDelta: delta,
            quantityBefore: balance.quantityOnHand,
            quantityAfter: movement.quantityBefore,
            averageUnitCostBefore: balance.averageUnitCost,
            averageUnitCostAfter: movement.averageUnitCostBefore,
            unitCost: movement.unitCost,
            totalCost: MoneyService.quantize(delta.mul(movement.unitCost)),
            occurredAt: new Date(),
            idempotencyKey: `${documentId}:void:${movement.id}`,
            reversedMovementId: movement.id,
          },
        });
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
    tx: Transaction,
    balance: InventoryBalance,
    item: InventoryDocumentWithItems['items'][number],
    document: InventoryDocumentWithItems,
    delta: Prisma.Decimal,
    unitCost: Prisma.Decimal,
    type: InventoryMovementType,
  ): Promise<void> {
    const quantityAfter = balance.quantityOnHand.plus(delta);
    if (quantityAfter.isNegative()) {
      throw new AppException(
        ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
        HttpStatus.CONFLICT,
      );
    }
    const next = this.compute.nextState(
      {
        quantity: balance.quantityOnHand,
        averageUnitCost: balance.averageUnitCost,
      },
      delta,
      unitCost,
    );
    const averageUnitCostAfter = next.averageUnitCost;
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: {
        quantityOnHand: quantityAfter,
        averageUnitCost: averageUnitCostAfter,
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
        type,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantityDelta: delta,
        quantityBefore: balance.quantityOnHand,
        quantityAfter,
        averageUnitCostBefore: balance.averageUnitCost,
        averageUnitCostAfter,
        unitCost,
        totalCost: MoneyService.quantize(delta.mul(unitCost)),
        occurredAt: document.occurredAt,
        idempotencyKey: `${document.id}:post:${item.id}:${balance.productLocationId}`,
      },
    });
    balance.quantityOnHand = quantityAfter;
    balance.averageUnitCost = averageUnitCostAfter;
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
    if (type === InventoryDocumentType.STOCKTAKE && delta.gt(0)) {
      if (balance.quantityOnHand.isZero() && itemCost == null) {
        throw new AppException(
          ErrorCode.INVENTORY_UNIT_COST_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      return itemCost ?? balance.averageUnitCost;
    }
    return balance.averageUnitCost;
  }

  private movementType(type: InventoryDocumentType): InventoryMovementType {
    const types: Record<InventoryDocumentType, InventoryMovementType> = {
      RECEIPT: InventoryMovementType.RECEIPT,
      WRITE_OFF: InventoryMovementType.WRITE_OFF,
      ADJUSTMENT: InventoryMovementType.ADJUSTMENT,
      STOCKTAKE: InventoryMovementType.STOCKTAKE,
      TRANSFER: InventoryMovementType.TRANSFER_OUT,
    };
    return types[type];
  }

  private async lockBalances(
    tx: Transaction,
    productLocationIds: string[],
  ): Promise<Map<string, InventoryBalance>> {
    const ids = [...new Set(productLocationIds)].sort();
    for (const productLocationId of ids) {
      await tx.inventoryBalance.upsert({
        where: { productLocationId },
        create: { productLocationId },
        update: {},
      });
    }
    const rows = await tx.$queryRaw<InventoryBalance[]>(Prisma.sql`
      SELECT * FROM "InventoryBalance"
      WHERE "productLocationId" IN (${Prisma.join(ids)})
      ORDER BY "productLocationId"
      FOR UPDATE
    `);
    return new Map(rows.map((row) => [row.productLocationId, row]));
  }

  private lockDocument(tx: Transaction, documentId: string): Promise<unknown> {
    return tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "InventoryDocument" WHERE "id" = ${documentId} FOR UPDATE
    `);
  }

  private async findDocumentInTransaction(
    tx: Transaction,
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
  ) {
    if (!document.destinationLocationId) {
      throw new AppException(
        ErrorCode.INVENTORY_DESTINATION_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    const rows = await this.products.resolveForInventory(
      document.destinationLocationId,
      document.items.map((item) => item.productId),
    );
    if (rows.length !== document.items.length) {
      throw new AppException(
        ErrorCode.INVENTORY_PRODUCT_NOT_CONFIGURED,
        HttpStatus.BAD_REQUEST,
      );
    }
    return rows;
  }

  private async validateDraft(
    locationId: string,
    brandId: string,
    dto: CreateInventoryDocumentDto,
  ) {
    if (new Date(dto.occurredAt).getTime() > Date.now()) {
      throw new AppException(
        ErrorCode.INVENTORY_FUTURE_DATE,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productIds = dto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new AppException(
        ErrorCode.INVENTORY_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      (dto.type === InventoryDocumentType.WRITE_OFF ||
        dto.type === InventoryDocumentType.ADJUSTMENT) &&
      !dto.reason?.trim()
    ) {
      throw new AppException(
        ErrorCode.INVENTORY_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.type === InventoryDocumentType.TRANSFER) {
      if (
        !dto.destinationLocationId ||
        dto.destinationLocationId === locationId
      ) {
        throw new AppException(
          ErrorCode.INVENTORY_DESTINATION_INVALID,
          HttpStatus.BAD_REQUEST,
        );
      }
      const destination = await this.locations.findById(
        dto.destinationLocationId,
      );
      if (destination.brandId !== brandId) {
        throw new AppException(
          ErrorCode.INVENTORY_DESTINATION_INVALID,
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (dto.destinationLocationId) {
      throw new AppException(
        ErrorCode.INVENTORY_DESTINATION_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    this.validateItems(dto.type, dto.items);
    const rows = await this.products.resolveForInventory(
      locationId,
      productIds,
    );
    if (rows.length !== productIds.length) {
      throw new AppException(
        ErrorCode.INVENTORY_PRODUCT_NOT_CONFIGURED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.type === InventoryDocumentType.TRANSFER) {
      const destinationRows = await this.products.resolveForInventory(
        dto.destinationLocationId!,
        productIds,
      );
      if (destinationRows.length !== productIds.length) {
        throw new AppException(
          ErrorCode.INVENTORY_PRODUCT_NOT_CONFIGURED,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return rows;
  }

  private validateItems(
    type: InventoryDocumentType,
    items: InventoryDocumentItemDto[],
  ): void {
    for (const item of items) {
      const quantity = new Prisma.Decimal(item.quantity);
      const cost =
        item.unitCost == null ? null : new Prisma.Decimal(item.unitCost);
      if (type === InventoryDocumentType.ADJUSTMENT) {
        if (quantity.isZero()) this.invalidDocument();
        if (quantity.gt(0) && cost == null) {
          throw new AppException(
            ErrorCode.INVENTORY_UNIT_COST_REQUIRED,
            HttpStatus.BAD_REQUEST,
          );
        }
      } else if (type === InventoryDocumentType.STOCKTAKE) {
        if (quantity.isNegative()) this.invalidDocument();
      } else if (quantity.lte(0)) {
        this.invalidDocument();
      }
      if (type === InventoryDocumentType.RECEIPT && cost == null) {
        throw new AppException(
          ErrorCode.INVENTORY_UNIT_COST_REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        type !== InventoryDocumentType.RECEIPT &&
        type !== InventoryDocumentType.ADJUSTMENT &&
        type !== InventoryDocumentType.STOCKTAKE &&
        cost != null
      ) {
        this.invalidDocument();
      }
    }
  }

  private itemData(
    items: InventoryDocumentItemDto[],
    resolved: Awaited<ReturnType<ProductsService['resolveForInventory']>>,
  ) {
    const byProduct = new Map(resolved.map((row) => [row.productId, row]));
    return items.map((item) => {
      const row = byProduct.get(item.productId)!;
      return {
        productLocationId: row.id,
        productId: row.productId,
        productName: row.product.name,
        productSku: row.product.sku,
        productUnit: row.product.unit,
        quantity: item.quantity,
        unitCost: item.unitCost ?? null,
      };
    });
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

  private invalidDocument(): never {
    throw new AppException(
      ErrorCode.INVENTORY_DOCUMENT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
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
