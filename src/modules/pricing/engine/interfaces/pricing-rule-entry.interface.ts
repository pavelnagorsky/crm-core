import { PriceScheduleType } from '../enums/price-schedule-type.enum.js';
import { PriceValueType } from '../enums/price-value-type.enum.js';
import { PricingRuleIntervalEntry } from './pricing-rule-interval-entry.interface.js';
import { PricingRuleTargetEntry } from './pricing-rule-target-entry.interface.js';

/**
 * Surcharge rule as the engine applies it (docs/pricing-stage3-api.md). Dates are local
 * YYYY-MM-DD strings, money and percents are integer hundredths.
 */
export interface PricingRuleEntry {
  id: string;
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
  /** ISO timestamp, display order. */
  createdAt: string;
}
