import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleAuditSnapshot } from '../../audit/interfaces/price-rule-audit-snapshot.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { PriceRuleTargetView } from '../interfaces/price-rule-target-view.interface.js';
import { maskToWeekdays } from './price-rule-input.rules.js';

const day = (date: Date | null): string | null =>
  date ? TimeUtils.dateOnlyStr(date) : null;

/**
 * The rule as display strings. Targets are listed by name (the id when the target is gone),
 * excluded ones with a minus sign.
 */
export function priceRuleAuditSnapshot(
  rule: PriceRuleRecord,
  targets: readonly PriceRuleTargetView[],
): PriceRuleAuditSnapshot {
  return {
    scheduleType: rule.scheduleType,
    name: rule.name,
    note: rule.note,
    enabled: rule.enabled,
    valueType: rule.valueType,
    value: MoneyUtils.format(rule.value),
    visitFrom: day(rule.visitFrom),
    visitTo: day(rule.visitTo),
    yearly: rule.yearly,
    holidayExclusive: rule.holidayExclusive,
    weekdays: maskToWeekdays(rule.weekdaysMask).join(', '),
    intervals: rule.intervals
      .map(
        (item) =>
          `${TimeUtils.minutesToHHmm(item.startMinute)}-${TimeUtils.minutesToHHmm(item.endMinute)}`,
      )
      .join(', '),
    dates: rule.dates
      .map((item) => TimeUtils.dateOnlyStr(item.date))
      .join(', '),
    appliesToAll: rule.appliesToAll,
    targets: targets
      .map(
        (target) => `${target.excluded ? '-' : ''}${target.name ?? target.id}`,
      )
      .join(', '),
  };
}
