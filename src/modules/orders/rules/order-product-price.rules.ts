import { ForbiddenException } from '@nestjs/common';
import {
  DiscountChoiceMode as PrismaDiscountChoiceMode,
  OrderItemStatus,
  OrderItemType,
  Prisma,
} from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import { PriceAdjustmentKind } from '../../pricing/engine/enums/price-adjustment-kind.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { ProductLinePrice } from '../../pricing/interfaces/product-line-price.interface.js';
import { OrderPriceAdjustmentData } from '../interfaces/order-price-adjustment-data.interface.js';
import { ProductPriceData } from '../interfaces/product-price-data.interface.js';
import { sameAdjustments } from './order-price-adjustment.rules.js';

type StoredChoice = {
  discountChoice: PrismaDiscountChoiceMode | null;
  discountChoiceRuleId: string | null;
};

type PricedItem = StoredChoice & {
  baseUnitPrice: Prisma.Decimal;
  listUnitPrice: Prisma.Decimal;
  customUnitPrice: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  priceAdjustments: readonly (OrderPriceAdjustmentData & { id?: string })[];
};

/** A choice as the request sent it; AUTO and a missing choice are null. */
export function requestedChoice(
  promotion: { mode: DiscountChoiceMode; ruleId?: string | null } | undefined,
): LineDiscountChoice | null {
  if (!promotion || promotion.mode === DiscountChoiceMode.AUTO) return null;
  return {
    mode: promotion.mode,
    ruleId:
      promotion.mode === DiscountChoiceMode.RULE
        ? (promotion.ruleId ?? null)
        : null,
  };
}

/**
 * The stored choice of a line applied again: a discount that no longer applies gives the
 * best one (fallbackToAuto). Null is AUTO; a RULE whose rule is gone is AUTO.
 */
export function storedChoice(item: StoredChoice): LineDiscountChoice | null {
  const mode = item.discountChoice as DiscountChoiceMode | null;
  if (mode === null || mode === DiscountChoiceMode.AUTO) return null;
  if (mode === DiscountChoiceMode.RULE && item.discountChoiceRuleId === null)
    return null;
  return {
    mode,
    ruleId: mode === DiscountChoiceMode.RULE ? item.discountChoiceRuleId : null,
    fallbackToAuto: true,
  };
}

function sameChoice(
  left: LineDiscountChoice | null,
  right: LineDiscountChoice | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.mode === right.mode && (left.ruleId ?? null) === (right.ruleId ?? null)
  );
}

/**
 * NONE, RULE, CLIENT_DISCOUNT and any change of a stored choice where the old or the new one
 * is not AUTO need sale.price.override:write. Not sent: the stored choice stays, no check.
 */
export function assertChoiceAccess(
  canOverride: boolean,
  incoming: { mode: DiscountChoiceMode; ruleId?: string | null } | undefined,
  stored: StoredChoice | null,
): void {
  if (canOverride || incoming === undefined) return;
  const next = requestedChoice(incoming);
  const previous = stored ? storedChoice(stored) : null;
  if (next === null && previous === null) return;
  if (sameChoice(next, previous)) return;
  throw new ForbiddenException('Discount choice permission required');
}

/**
 * Whether a choice survived its pricing: NONE always; RULE and CLIENT_DISCOUNT when the line
 * got that discount. A custom price has no discount to compare, so the choice stays.
 */
function choiceHeld(choice: LineDiscountChoice, line: ProductLinePrice): boolean {
  if (line.customUnitPrice !== null) return true;
  switch (choice.mode) {
    case DiscountChoiceMode.RULE:
      return (
        (line.discount?.kind as string | undefined) ===
          PriceAdjustmentKind.PROMOTION &&
        line.discount?.ruleId === choice.ruleId
      );
    case DiscountChoiceMode.CLIENT_DISCOUNT:
      return (
        (line.discount?.kind as string | undefined) ===
        PriceAdjustmentKind.CLIENT_DISCOUNT
      );
    default:
      return true;
  }
}

/**
 * Columns and layers of a priced product line. The choice is kept while it holds; a stored
 * pick that fell back to the best discount is dropped (AUTO), as on a booking item.
 */
export function productPriceData(
  line: ProductLinePrice,
  choice: LineDiscountChoice | null,
): ProductPriceData {
  const kept = choice !== null && choiceHeld(choice, line) ? choice : null;
  return {
    fields: {
      baseUnitPrice: line.baseUnitPrice,
      listUnitPrice: line.listUnitPrice,
      customUnitPrice: line.customUnitPrice,
      unitPrice: line.unitPrice,
      lineSubtotal: line.lineSubtotal,
      discountTotal: line.discountTotal,
      lineTotal: line.lineTotal,
      discountChoice: kept ? (kept.mode as PrismaDiscountChoiceMode) : null,
      discountChoiceRuleId:
        kept?.mode === DiscountChoiceMode.RULE ? (kept.ruleId ?? null) : null,
    },
    adjustments: line.adjustments.map((layer, sortOrder) => ({
      sortOrder,
      kind: layer.kind,
      ruleId: layer.ruleId,
      title: layer.title,
      publicTitle: layer.publicTitle,
      valueType: layer.valueType,
      value: layer.value,
      amount: layer.amount,
    })),
  };
}

/** Whether a stored line already has this price, layers and choice. */
export function sameProductPrice(
  item: PricedItem,
  data: ProductPriceData,
): boolean {
  const { fields } = data;
  const equal = (left: Prisma.Decimal | null, right: Prisma.Decimal | null) =>
    left === null || right === null ? left === right : left.equals(right);
  return (
    equal(item.baseUnitPrice, fields.baseUnitPrice) &&
    equal(item.listUnitPrice, fields.listUnitPrice) &&
    equal(item.customUnitPrice, fields.customUnitPrice) &&
    equal(item.unitPrice, fields.unitPrice) &&
    equal(item.lineSubtotal, fields.lineSubtotal) &&
    equal(item.discountTotal, fields.discountTotal) &&
    equal(item.lineTotal, fields.lineTotal) &&
    item.discountChoice === fields.discountChoice &&
    item.discountChoiceRuleId === fields.discountChoiceRuleId &&
    sameAdjustments(
      item.priceAdjustments.map(({ id: _id, ...layer }) => ({
        sortOrder: layer.sortOrder,
        kind: layer.kind,
        ruleId: layer.ruleId,
        title: layer.title,
        publicTitle: layer.publicTitle,
        valueType: layer.valueType,
        value: layer.value,
        amount: layer.amount,
      })),
      data.adjustments,
    )
  );
}

/**
 * Σ listLineTotal of the confirmed product lines of an order: the sold part of the visit or
 * sale total that minVisitTotal of a product line looks at.
 */
export function confirmedProductListTotal(
  items: readonly {
    type: OrderItemType;
    status: OrderItemStatus;
    quantity: Prisma.Decimal;
    listUnitPrice: Prisma.Decimal;
  }[],
): Prisma.Decimal {
  return items.reduce(
    (sum, item) =>
      item.type === OrderItemType.PRODUCT &&
      item.status === OrderItemStatus.CONFIRMED
        ? sum.plus(MoneyUtils.quantize(item.quantity.mul(item.listUnitPrice)))
        : sum,
    MoneyUtils.decimal(0),
  );
}
