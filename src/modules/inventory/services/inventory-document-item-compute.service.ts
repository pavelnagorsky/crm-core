import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryDocumentType, Prisma, ProductUnit } from '@prisma/client';
import { fitsDecimal } from '../../../shared/database/fits-decimal.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { UnitCostService } from '../../../shared/money/unit-cost.service.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { InventoryDocumentItemDto } from '../dto/inventory-document-item.dto.js';
import { InventoryDocumentItemValues } from '../interfaces/inventory-document-item-values.interface.js';
import { InventoryPackaging } from '../interfaces/inventory-packaging.interface.js';

@Injectable()
export class InventoryDocumentItemComputeService {
  normalize(
    type: InventoryDocumentType,
    item: InventoryDocumentItemDto,
    baseUnit: ProductUnit,
    packaging?: InventoryPackaging,
  ): InventoryDocumentItemValues {
    if (item.packagingId != null) {
      return this.normalizePackaging(type, item, baseUnit, packaging);
    }
    if (
      item.quantity == null ||
      item.packageQuantity != null ||
      item.packageUnitCost != null
    )
      this.invalid();
    return this.normalizeValues(
      type,
      new Prisma.Decimal(item.quantity),
      item.unitCost == null ? null : new Prisma.Decimal(item.unitCost),
      baseUnit,
      new Prisma.Decimal(1),
    );
  }

  private normalizePackaging(
    type: InventoryDocumentType,
    item: InventoryDocumentItemDto,
    baseUnit: ProductUnit,
    packaging?: InventoryPackaging,
  ): InventoryDocumentItemValues {
    if (
      type !== InventoryDocumentType.RECEIPT ||
      !packaging ||
      packaging.id !== item.packagingId ||
      packaging.productId !== item.productId ||
      item.quantity != null ||
      item.unitCost != null ||
      item.packageQuantity == null ||
      item.packageUnitCost == null
    ) {
      throw new AppException(
        ErrorCode.INVENTORY_PACKAGING_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    const packageQuantity = new Prisma.Decimal(item.packageQuantity);
    const packageUnitCost = new Prisma.Decimal(item.packageUnitCost);
    if (!packageQuantity.isInteger()) this.invalid();
    const values = this.normalizeValues(
      type,
      packageQuantity,
      packageUnitCost,
      baseUnit,
      packaging.quantityInBaseUnit,
    );
    return {
      ...values,
      packagingId: packaging.id,
      packagingName: packaging.name,
      packagingFactor: packaging.quantityInBaseUnit,
      packageQuantity,
      packageUnitCost,
    };
  }

  private normalizeValues(
    type: InventoryDocumentType,
    enteredQuantity: Prisma.Decimal,
    enteredCost: Prisma.Decimal | null,
    baseUnit: ProductUnit,
    factor: Prisma.Decimal,
  ): InventoryDocumentItemValues {
    const quantity = enteredQuantity.mul(factor);
    if (
      !fitsDecimal(enteredQuantity, 14, 3) ||
      !fitsDecimal(quantity, 14, 3) ||
      (baseUnit === ProductUnit.PIECE && !quantity.isInteger())
    ) {
      throw new AppException(
        ErrorCode.INVENTORY_QUANTITY_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      type === InventoryDocumentType.ADJUSTMENT
        ? quantity.isZero()
        : quantity.lte(0)
    )
      this.invalid();
    if (
      enteredCost != null &&
      (enteredCost.lt(0) || !fitsDecimal(enteredCost, 12, 2))
    )
      this.invalid();
    const needsCost =
      type === InventoryDocumentType.RECEIPT ||
      (type === InventoryDocumentType.ADJUSTMENT && quantity.gt(0));
    if (needsCost && enteredCost == null) {
      throw new AppException(
        ErrorCode.INVENTORY_UNIT_COST_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      type !== InventoryDocumentType.RECEIPT &&
      type !== InventoryDocumentType.ADJUSTMENT &&
      enteredCost != null
    )
      this.invalid();
    const totalCost =
      enteredCost == null
        ? null
        : MoneyService.quantize(enteredQuantity.mul(enteredCost));
    const unitCost =
      enteredCost == null
        ? null
        : UnitCostService.quantize(enteredCost.div(factor));
    if (
      (totalCost != null && !fitsDecimal(totalCost, 14, 2)) ||
      (unitCost != null && !fitsDecimal(unitCost, 18, 8))
    )
      this.invalid();
    return {
      quantity,
      unitCost,
      totalCost,
      packagingId: null,
      packagingName: null,
      packagingFactor: null,
      packageQuantity: null,
      packageUnitCost: null,
    };
  }

  private invalid(): never {
    throw new AppException(
      ErrorCode.INVENTORY_DOCUMENT_INVALID,
      HttpStatus.BAD_REQUEST,
    );
  }
}
