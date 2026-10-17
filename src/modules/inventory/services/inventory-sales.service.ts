import { Injectable } from '@nestjs/common';
import {
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { InventoryValuationCalculator } from '../calculators/inventory-valuation.calculator.js';
import { InventorySaleCost } from '../interfaces/inventory-sale-cost.interface.js';
import { InventorySaleLine } from '../interfaces/inventory-sale-line.interface.js';
import { InventoryBalanceLockService } from './inventory-balance-lock.service.js';
import { InventorySaleReversalService } from './inventory-sale-reversal.service.js';

@Injectable()
export class InventorySalesService {
  constructor(
    private readonly compute: InventoryValuationCalculator,
    private readonly balanceLocks: InventoryBalanceLockService,
    private readonly saleReversals: InventorySaleReversalService,
  ) {}
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
}
