import { PriceAdjustmentKind } from '../enums/price-adjustment-kind.enum.js';
import { PriceValueType } from '../enums/price-value-type.enum.js';

/** One price layer of a line. Money and percents are in hundredths (minor units, basis points). */
export interface PriceAdjustment {
  kind: PriceAdjustmentKind;
  ruleId: string | null;
  title: string;
  publicTitle: string | null;
  valueType: PriceValueType | null;
  /** Rule value: basis points for PERCENT, minor units for AMOUNT. */
  value: number | null;
  /** Signed change of the line price in minor units. */
  amount: number;
}
