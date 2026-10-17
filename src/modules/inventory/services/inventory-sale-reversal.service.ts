import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { InventoryValuationCalculator } from '../calculators/inventory-valuation.calculator.js';
import { InventoryBalanceLockService } from './inventory-balance-lock.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';

@Injectable()
export class InventorySaleReversalService {
  constructor(
    private readonly compute: InventoryValuationCalculator,
    private readonly balanceLocks: InventoryBalanceLockService,
  ) {}

  async reverse(
    locationId: string,
    orderId: string,
    occurredAt: Date,
    tx: Prisma.TransactionClient,
    orderItemId?: string,
    quantitiesByOrderItem: Map<string, Prisma.Decimal> = new Map(),
    returnItemByOrderItem: Map<string, string> = new Map(),
  ): Promise<void> {
    const originals = await tx.inventoryMovement.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        orderId,
        orderItemId,
        type: InventoryMovementType.SALE,
      },
      orderBy: { productLocationId: 'asc' },
    });
    if (originals.length === 0) return;

    const reversed = await tx.inventoryMovement.findMany({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        orderId,
        orderItemId,
        type: InventoryMovementType.SALE_REVERSAL,
      },
      select: { orderItemId: true, quantityDelta: true, totalCost: true },
    });
    const reversedCosts = new Map<string, Prisma.Decimal>();
    const reversedByOrderItem = new Map<string, Prisma.Decimal>();
    for (const movement of reversed) {
      if (!movement.orderItemId) continue;
      reversedCosts.set(
        movement.orderItemId,
        (reversedCosts.get(movement.orderItemId) ?? new Prisma.Decimal(0)).plus(
          movement.totalCost,
        ),
      );
      reversedByOrderItem.set(
        movement.orderItemId,
        (
          reversedByOrderItem.get(movement.orderItemId) ?? new Prisma.Decimal(0)
        ).plus(movement.quantityDelta),
      );
    }

    const pending = originals.flatMap((movement) => {
      if (!movement.orderItemId) return [];
      const soldQuantity = movement.quantityDelta.neg();
      const reversedQuantity =
        reversedByOrderItem.get(movement.orderItemId) ?? new Prisma.Decimal(0);
      const remaining = soldQuantity.minus(reversedQuantity);
      const requested = quantitiesByOrderItem.get(movement.orderItemId);
      const quantity = requested ?? remaining;
      if (quantity.lte(0) || remaining.lte(0)) return [];
      if (quantity.gt(remaining)) {
        throw new AppException(
          ErrorCode.ORDER_RETURN_QUANTITY_EXCEEDS_REMAINING,
          HttpStatus.BAD_REQUEST,
        );
      }
      return [{ movement, quantity, reversedQuantity, soldQuantity }];
    });
    if (pending.length === 0) return;

    const balances = await this.balanceLocks.lock(
      tx,
      pending.map((row) => row.movement.productLocationId),
    );
    for (const pendingMovement of pending) {
      const { movement, quantity, reversedQuantity, soldQuantity } =
        pendingMovement;
      const movementOrderItemId = movement.orderItemId!;
      const balance = balances.get(movement.productLocationId)!;
      const totalCost = MoneyUtils.allocateCumulative(
        movement.totalCost.neg(),
        soldQuantity,
        quantity,
        reversedQuantity,
        reversedCosts.get(movementOrderItemId) ?? new Prisma.Decimal(0),
      );
      const next = this.compute.nextState(
        {
          quantity: balance.quantityOnHand,
          averageUnitCost: balance.averageUnitCost,
          stockValue: balance.stockValue,
        },
        quantity,
        movement.unitCost,
        totalCost,
      );
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          quantityOnHand: next.quantity,
          averageUnitCost: next.averageUnitCost,
          stockValue: next.stockValue,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          locationId,
          productLocationId: movement.productLocationId,
          orderId,
          orderItemId: movementOrderItemId,
          orderReturnItemId:
            returnItemByOrderItem.get(movementOrderItemId) ?? null,
          sourceType: InventoryMovementSourceType.ORDER,
          sourceId: orderId,
          sourceLocationId: locationId,
          type: InventoryMovementType.SALE_REVERSAL,
          productId: movement.productId,
          productName: movement.productName,
          productSku: movement.productSku,
          quantityDelta: quantity,
          quantityBefore: balance.quantityOnHand,
          quantityAfter: next.quantity,
          averageUnitCostBefore: balance.averageUnitCost,
          averageUnitCostAfter: next.averageUnitCost,
          stockValueBefore: balance.stockValue,
          stockValueAfter: next.stockValue,
          unitCost: movement.unitCost,
          totalCost,
          occurredAt,
          idempotencyKey: `order:${orderId}:item:${movementOrderItemId}:sale-reversal:${reversedQuantity.plus(quantity).toFixed(3)}`,
          reversedMovementId:
            reversedQuantity.isZero() && quantity.equals(soldQuantity)
              ? movement.id
              : null,
        },
      });
      balance.quantityOnHand = next.quantity;
      balance.averageUnitCost = next.averageUnitCost;
      balance.stockValue = next.stockValue;
    }
  }
}
