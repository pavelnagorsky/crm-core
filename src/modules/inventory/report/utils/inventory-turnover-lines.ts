import { InventoryMovementType, Prisma, ProductUnit } from '@prisma/client';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { QuantityService } from '../../../../shared/quantity/quantity.service.js';
import { InventoryTurnoverBucketRow } from '../interfaces/inventory-turnover-bucket-row.interface.js';
import { InventoryTurnoverLine } from '../interfaces/inventory-turnover-line.interface.js';

const OPENING = 'OPENING';

const MOVEMENT_COLUMN_ORDER = {
  [InventoryMovementType.RECEIPT]: true,
  [InventoryMovementType.TRANSFER_IN]: true,
  [InventoryMovementType.WRITE_OFF]: true,
  [InventoryMovementType.TRANSFER_OUT]: true,
  [InventoryMovementType.SALE]: true,
  [InventoryMovementType.SALE_REVERSAL]: true,
  [InventoryMovementType.ADJUSTMENT]: true,
  [InventoryMovementType.STOCKTAKE]: true,
  [InventoryMovementType.REVERSAL]: true,
} satisfies Record<InventoryMovementType, true>;

export const INVENTORY_MOVEMENT_COLUMNS = Object.keys(
  MOVEMENT_COLUMN_ORDER,
) as InventoryMovementType[];

export function inventoryTurnoverLines(
  rows: readonly InventoryTurnoverBucketRow[],
): InventoryTurnoverLine[] {
  const byProduct = new Map<string, InventoryTurnoverLine>();
  for (const row of rows) {
    const line = byProduct.get(row.productLocationId) ?? emptyLine(row);
    byProduct.set(row.productLocationId, line);
    const quantity = QuantityService.decimal(row.quantity);
    const value = MoneyService.decimal(row.value);
    if (row.bucket === OPENING) {
      line.openingQuantity = line.openingQuantity.plus(quantity);
      line.openingValue = line.openingValue.plus(value);
      continue;
    }
    if (!isMovementColumn(row.bucket)) {
      throw new Error(`Unknown inventory movement bucket: ${row.bucket}`);
    }
    line.quantities[row.bucket] = line.quantities[row.bucket].plus(quantity);
    line.periodValue = line.periodValue.plus(value);
  }
  return [...byProduct.values()]
    .map(closeLine)
    .filter(hasActivity)
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name, 'ru');
      return byName === 0
        ? left.productLocationId.localeCompare(right.productLocationId)
        : byName;
    });
}

export function sumInventoryTurnoverLines(
  lines: readonly InventoryTurnoverLine[],
): InventoryTurnoverLine {
  const totals = blankLine();
  for (const line of lines) {
    totals.openingQuantity = totals.openingQuantity.plus(line.openingQuantity);
    totals.openingValue = totals.openingValue.plus(line.openingValue);
    totals.periodValue = totals.periodValue.plus(line.periodValue);
    totals.closingQuantity = totals.closingQuantity.plus(line.closingQuantity);
    totals.closingValue = totals.closingValue.plus(line.closingValue);
    for (const type of INVENTORY_MOVEMENT_COLUMNS) {
      totals.quantities[type] = totals.quantities[type].plus(
        line.quantities[type],
      );
    }
  }
  return totals;
}

function isMovementColumn(bucket: string): bucket is InventoryMovementType {
  return Object.hasOwn(MOVEMENT_COLUMN_ORDER, bucket);
}

function closeLine(line: InventoryTurnoverLine): InventoryTurnoverLine {
  line.closingQuantity = INVENTORY_MOVEMENT_COLUMNS.reduce(
    (quantity, type) => quantity.plus(line.quantities[type]),
    line.openingQuantity,
  );
  line.closingValue = line.openingValue.plus(line.periodValue);
  return line;
}

function hasActivity(line: InventoryTurnoverLine): boolean {
  return (
    !line.openingQuantity.isZero() ||
    !line.openingValue.isZero() ||
    !line.periodValue.isZero() ||
    INVENTORY_MOVEMENT_COLUMNS.some((type) => !line.quantities[type].isZero())
  );
}

function emptyLine(row: InventoryTurnoverBucketRow): InventoryTurnoverLine {
  return {
    ...blankLine(),
    productLocationId: row.productLocationId,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
  };
}

function blankLine(): InventoryTurnoverLine {
  return {
    productLocationId: '',
    name: '',
    sku: null,
    unit: ProductUnit.PIECE,
    openingQuantity: new Prisma.Decimal(0),
    openingValue: new Prisma.Decimal(0),
    quantities: Object.fromEntries(
      INVENTORY_MOVEMENT_COLUMNS.map((type) => [type, new Prisma.Decimal(0)]),
    ) as Record<InventoryMovementType, Prisma.Decimal>,
    periodValue: new Prisma.Decimal(0),
    closingQuantity: new Prisma.Decimal(0),
    closingValue: new Prisma.Decimal(0),
  };
}
