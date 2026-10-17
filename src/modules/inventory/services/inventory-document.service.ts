import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  InventoryBalance,
  InventoryDocument,
  InventoryDocumentStatus,
  InventoryDocumentType,
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { InventoryValuationCalculator } from '../calculators/inventory-valuation.calculator.js';
import { documentInclude } from '../constants/inventory-document.include.js';
import { CreateInventoryDocumentDto } from '../dto/create-inventory-document.dto.js';
import { UpdateInventoryDocumentDto } from '../dto/update-inventory-document.dto.js';
import { InventoryDocumentTargetStatus } from '../enums/inventory-document-target-status.enum.js';
import { InventoryDocumentTransition } from '../interfaces/inventory-document-transition.interface.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryBalanceLockService } from './inventory-balance-lock.service.js';
import { InventoryDocumentDraftService } from './inventory-document-draft.service.js';
import { InventoryDocumentMovementService } from './inventory-document-movement.service.js';

@Injectable()
export class InventoryDocumentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly drafts: InventoryDocumentDraftService,
    private readonly locations: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly compute: InventoryValuationCalculator,
    private readonly balanceLocks: InventoryBalanceLockService,
    private readonly movements: InventoryDocumentMovementService,
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
          const outgoing = await this.movements.applyDocumentMovement(
            tx,
            source,
            item,
            document,
            item.quantity.neg(),
            unitCost,
            InventoryMovementType.TRANSFER_OUT,
          );
          await this.movements.applyDocumentMovement(
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
        await this.movements.applyDocumentMovement(
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
