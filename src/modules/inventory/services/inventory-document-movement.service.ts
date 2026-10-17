import { Injectable } from '@nestjs/common';
import {
  InventoryBalance,
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { InventoryValuationCalculator } from '../calculators/inventory-valuation.calculator.js';
import { InventoryDocumentWithItems } from '../interfaces/inventory-document-with-items.interface.js';
import { InventoryValuation } from '../interfaces/inventory-valuation.interface.js';

@Injectable()
export class InventoryDocumentMovementService {
  constructor(private readonly compute: InventoryValuationCalculator) {}
  async applyDocumentMovement(
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
}
