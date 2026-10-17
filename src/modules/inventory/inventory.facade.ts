import { Injectable } from '@nestjs/common';
import { InventoryDocument, InventoryMovement, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { CreateInventoryDocumentDto } from './dto/create-inventory-document.dto.js';
import { InventoryCountsRequestDto } from './dto/inventory-counts-request.dto.js';
import { InventoryDocumentSearchRequestDto } from './dto/inventory-document-search-request.dto.js';
import { InventoryDocumentStatusCountsRequestDto } from './dto/inventory-document-status-counts-request.dto.js';
import { InventoryMovementSearchRequestDto } from './dto/inventory-movement-search-request.dto.js';
import { InventorySearchRequestDto } from './dto/inventory-search-request.dto.js';
import { UpdateInventoryDocumentDto } from './dto/update-inventory-document.dto.js';
import { InventoryDocumentTargetStatus } from './enums/inventory-document-target-status.enum.js';
import { InventoryBalanceView } from './interfaces/inventory-balance-view.interface.js';
import { InventoryCountsView } from './interfaces/inventory-counts-view.interface.js';
import { InventoryDocumentStatusCount } from './interfaces/inventory-document-status-count.interface.js';
import { InventoryDocumentWithItems } from './interfaces/inventory-document-with-items.interface.js';
import { InventorySaleCost } from './interfaces/inventory-sale-cost.interface.js';
import { InventorySaleLine } from './interfaces/inventory-sale-line.interface.js';
import { InventoryDocumentService } from './services/inventory-document.service.js';
import { InventoryReadService } from './services/inventory-read.service.js';
import { InventorySalesService } from './services/inventory-sales.service.js';

@Injectable()
export class InventoryFacade {
  constructor(
    private readonly documents: InventoryDocumentService,
    private readonly read: InventoryReadService,
    private readonly sales: InventorySalesService,
  ) {}
  createDocument(
    locationId: string,
    dto: CreateInventoryDocumentDto,
    actor: AuditActor,
  ): Promise<InventoryDocument> {
    return this.documents.createDocument(locationId, dto, actor);
  }

  updateDocument(
    expected: InventoryDocument,
    dto: UpdateInventoryDocumentDto,
    actor: AuditActor,
  ): Promise<InventoryDocument> {
    return this.documents.updateDocument(expected, dto, actor);
  }

  changeDocumentStatus(
    expected: InventoryDocument,
    status: InventoryDocumentTargetStatus,
    actor: AuditActor,
  ): Promise<InventoryDocumentWithItems> {
    return this.documents.changeDocumentStatus(expected, status, actor);
  }

  findDocument(
    locationId: string,
    documentId: string,
  ): Promise<InventoryDocumentWithItems> {
    return this.read.findDocument(locationId, documentId);
  }

  searchDocuments(
    locationId: string,
    dto: InventoryDocumentSearchRequestDto,
  ): Promise<PaginatedResult<InventoryDocumentWithItems>> {
    return this.read.searchDocuments(locationId, dto);
  }

  getDocumentStatusCounts(
    locationId: string,
    dto: InventoryDocumentStatusCountsRequestDto,
  ): Promise<InventoryDocumentStatusCount[]> {
    return this.read.getDocumentStatusCounts(locationId, dto);
  }

  searchInventory(
    locationId: string,
    dto: InventorySearchRequestDto,
  ): Promise<PaginatedResult<InventoryBalanceView>> {
    return this.read.searchInventory(locationId, dto);
  }

  getInventoryCounts(
    locationId: string,
    dto: InventoryCountsRequestDto,
  ): Promise<InventoryCountsView> {
    return this.read.getInventoryCounts(locationId, dto);
  }

  searchMovements(
    locationId: string,
    productId: string,
    dto: InventoryMovementSearchRequestDto,
  ): Promise<PaginatedResult<InventoryMovement>> {
    return this.read.searchMovements(locationId, productId, dto);
  }

  postSale(
    locationId: string,
    orderId: string,
    occurredAt: Date,
    lines: InventorySaleLine[],
    tx: Prisma.TransactionClient,
  ): Promise<InventorySaleCost[]> {
    return this.sales.postSale(locationId, orderId, occurredAt, lines, tx);
  }

  reverseSale(
    locationId: string,
    orderId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.sales.reverseSale(locationId, orderId, occurredAt, tx);
  }

  reverseSaleItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.sales.reverseSaleItem(
      locationId,
      orderId,
      orderItemId,
      occurredAt,
      tx,
    );
  }

  reverseSaleItemQuantity(
    locationId: string,
    orderId: string,
    orderItemId: string,
    quantity: Prisma.Decimal,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
    orderReturnItemId?: string,
  ): Promise<void> {
    return this.sales.reverseSaleItemQuantity(
      locationId,
      orderId,
      orderItemId,
      quantity,
      occurredAt,
      tx,
      orderReturnItemId,
    );
  }
}
