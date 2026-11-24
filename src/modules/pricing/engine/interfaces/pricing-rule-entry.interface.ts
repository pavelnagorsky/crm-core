import { PriceRuleKind } from '../enums/price-rule-kind.enum.js';
import { PriceScheduleType } from '../enums/price-schedule-type.enum.js';
import { PriceValueType } from '../enums/price-value-type.enum.js';
import { PricingPromotionEntry } from './pricing-promotion-entry.interface.js';
import { PricingRuleIntervalEntry } from './pricing-rule-interval-entry.interface.js';
import { PricingRuleTargetEntry } from './pricing-rule-target-entry.interface.js';

/**
 * Surcharge or promotion as the engine applies it (docs/pricing-stage3-api.md,
 * docs/pricing-stage4-api.md). Dates are local YYYY-MM-DD strings, money and percents
 * are integer hundredths. A promotion is always WEEKLY, empty weekdays = every day.
 */
export interface PricingRuleEntry {
  id: string;
  kind: PriceRuleKind;
  name: string;
  scheduleType: PriceScheduleType;
  /** Disabled rules are kept to explain why they did not apply. */
  enabled: boolean;
  valueType: PriceValueType;
  /** Basis points for PERCENT, minor units for AMOUNT. */
  value: number;
  visitFrom: string | null;
  visitTo: string | null;
  yearly: boolean;
  holidayExclusive: boolean;
  /** Bit (isoWeekday - 1); 0 = every day. */
  weekdaysMask: number;
  /** Empty = the whole day. */
  intervals: PricingRuleIntervalEntry[];
  /** HOLIDAYS dates. */
  dates: string[];
  appliesToAll: boolean;
  targets: PricingRuleTargetEntry[];
  /** Set for PROMOTION, null for SURCHARGE. */
  promotion: PricingPromotionEntry | null;
  /** ISO timestamp, display order; an earlier promotion wins a tie. */
  createdAt: string;
}
