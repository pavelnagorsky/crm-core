import { Injectable } from '@nestjs/common';
import { InventoryDocumentType, Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { InventoryState } from '../interfaces/inventory-state.interface.js';

@Injectable()
export class InventoryComputeService {
  nextState(
    before: InventoryState,
    delta: Prisma.Decimal,
    incomingUnitCost: Prisma.Decimal,
  ): InventoryState {
    const quantity = before.quantity.plus(delta);
    if (quantity.isZero()) {
      return { quantity, averageUnitCost: new Prisma.Decimal(0) };
    }
    if (delta.lte(0)) {
      return { quantity, averageUnitCost: before.averageUnitCost };
    }
    return {
      quantity,
      averageUnitCost: MoneyService.quantize(
        before.quantity
          .mul(before.averageUnitCost)
          .plus(delta.mul(incomingUnitCost))
          .div(quantity),
      ),
    };
  }

  documentDelta(
    type: InventoryDocumentType,
    quantity: Prisma.Decimal,
    onHand: Prisma.Decimal,
  ): Prisma.Decimal {
    if (type === InventoryDocumentType.WRITE_OFF) return quantity.neg();
    if (type === InventoryDocumentType.STOCKTAKE) return quantity.minus(onHand);
    return quantity;
  }
}
