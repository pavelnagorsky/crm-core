import {
  PriceRuleTargetType as PrismaPriceRuleTargetType,
  PriceScheduleType as PrismaPriceScheduleType,
  PriceValueType as PrismaPriceValueType,
} from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleTargetType } from '../engine/enums/price-rule-target-type.enum.js';
import { PriceScheduleType } from '../engine/enums/price-schedule-type.enum.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';

const day = (date: Date | null): string | null =>
  date ? TimeUtils.dateOnlyStr(date) : null;

/**
 * A stored rule as the price engine reads it: percent in basis points and amount in minor
 * units (both are hundredths of the stored decimal), dates as YYYY-MM-DD.
 */
export function toPricingRuleEntry(rule: PriceRuleRecord): PricingRuleEntry {
  return {
    id: rule.id,
    name: rule.name,
    scheduleType:
      rule.scheduleType as PrismaPriceScheduleType as string as PriceScheduleType,
    enabled: rule.enabled,
    valueType:
      rule.valueType as PrismaPriceValueType as string as PriceValueType,
    value: MoneyUtils.toMinor(rule.value),
    visitFrom: day(rule.visitFrom),
    visitTo: day(rule.visitTo),
    yearly: rule.yearly,
    holidayExclusive: rule.holidayExclusive,
    weekdaysMask: rule.weekdaysMask,
    intervals: rule.intervals.map((interval) => ({
      start: interval.startMinute,
      end: interval.endMinute,
    })),
    dates: rule.dates.map((item) => TimeUtils.dateOnlyStr(item.date)),
    appliesToAll: rule.appliesToAll,
    targets: rule.targets.map((target) => ({
      type: target.targetType as PrismaPriceRuleTargetType as string as PriceRuleTargetType,
      id: target.targetId,
      excluded: target.excluded,
    })),
    createdAt: rule.createdAt.toISOString(),
  };
}
