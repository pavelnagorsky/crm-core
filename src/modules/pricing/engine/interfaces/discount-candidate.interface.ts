import { PriceAdjustmentKind } from '../enums/price-adjustment-kind.enum.js';
import { PriceValueType } from '../enums/price-value-type.enum.js';

/** A discount that applies to a line, with what it would give. Money in minor units. */
export interface DiscountCandidate {
  kind: PriceAdjustmentKind.PROMOTION | PriceAdjustmentKind.CLIENT_DISCOUNT;
  /** Null for the client discount. */
  ruleId: string | null;
  title: string;
  /** Null when the promotion is not shown as one. */
  publicTitle: string | null;
  valueType: PriceValueType;
  /** Basis points for PERCENT, minor units for AMOUNT. */
  value: number;
  /** Discount, positive: list price - charged price. */
  amount: number;
  /** List price - amount, rounded down to the location step. */
  chargedPrice: number;
}
