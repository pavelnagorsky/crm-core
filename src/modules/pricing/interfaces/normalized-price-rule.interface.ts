import { PriceScheduleType, PriceValueType } from '@prisma/client';
import { PriceRuleIntervalMinutes } from './price-rule-interval-minutes.interface.js';
import { PriceRuleTargetRef } from './price-rule-target-ref.interface.js';

/** A validated rule input in the shape the tables store; dates are YYYY-MM-DD. */
export interface NormalizedPriceRule {
  scheduleType: PriceScheduleType;
  name: string;
  note: string | null;
  /** Null: the caller keeps the current value (update) or uses the default (create). */
  enabled: boolean | null;
  valueType: PriceValueType;
  /** Two-digit decimal string. */
  value: string;
  visitFrom: string | null;
  visitTo: string | null;
  yearly: boolean;
  holidayExclusive: boolean;
  weekdaysMask: number;
  intervals: PriceRuleIntervalMinutes[];
  dates: string[];
  appliesToAll: boolean;
  targets: PriceRuleTargetRef[];
}
