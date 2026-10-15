import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryDocumentType, Prisma } from '@prisma/client';
import { fitsDecimal } from '../../../shared/database/fits-decimal.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { InventoryState } from '../interfaces/inventory-state.interface.js';
import { InventoryValuation } from '../interfaces/inventory-valuation.interface.js';
import { UnitCostService } from '../../../shared/money/unit-cost.service.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

@Injectable()
export class InventoryComputeService {
  nextState(
    before: InventoryState,
    delta: Prisma.Decimal,
    incomingUnitCost: Prisma.Decimal,
    exactTotalCost?: Prisma.Decimal,
  ): InventoryValuation {
    const quantity = before.quantity.plus(delta);
    if (quantity.lt(0)) {
      throw new AppException(
        ErrorCode.INVENTORY_INSUFFICIENT_STOCK,
        HttpStatus.CONFLICT,
      );
    }
    if (!fitsDecimal(quantity, 14, 3)) {
      throw new AppException(
        ErrorCode.INVENTORY_QUANTITY_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    const totalCost =
      exactTotalCost ?? this.movementCost(before, delta, incomingUnitCost);
    const stockValue = before.stockValue.plus(totalCost);
    const averageUnitCost = quantity.isZero()
      ? new Prisma.Decimal(0)
      : UnitCostService.quantize(stockValue.div(quantity));
    if (
      stockValue.lt(0) ||
      !fitsDecimal(stockValue, 14, 2) ||
      !fitsDecimal(totalCost, 14, 2) ||
      !fitsDecimal(averageUnitCost, 18, 8) ||
      (quantity.isZero() && !stockValue.isZero())
    ) {
      throw new AppException(
        ErrorCode.INVENTORY_VALUE_OUT_OF_RANGE,
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      quantity,
      stockValue,
      totalCost,
      averageUnitCost,
    };
  }

  private movementCost(
    before: InventoryState,
    delta: Prisma.Decimal,
    incomingUnitCost: Prisma.Decimal,
  ): Prisma.Decimal {
    if (delta.gte(0)) return MoneyService.quantize(delta.mul(incomingUnitCost));
    if (before.quantity.plus(delta).isZero()) return before.stockValue.neg();
    return MoneyService.quantize(
      before.stockValue.mul(delta.abs()).div(before.quantity),
    ).neg();
  }

  documentDelta(
    type: InventoryDocumentType,
    quantity: Prisma.Decimal,
  ): Prisma.Decimal {
    if (type === InventoryDocumentType.WRITE_OFF) return quantity.neg();
    return quantity;
  }
}
