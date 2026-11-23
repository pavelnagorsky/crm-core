import { PriceScheduleType } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleHolidayConflict } from '../interfaces/price-rule-holiday-conflict.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';

const monthDay = (date: string): string => date.slice(5);

/** Enabled and exclusive: the only holiday rules that can collide. Archived ones are out of play. */
export function isExclusiveHoliday(
  rule: Pick<PriceRuleRecord, 'scheduleType' | 'holidayExclusive' | 'enabled'>,
): boolean {
  return (
    rule.scheduleType === PriceScheduleType.HOLIDAYS &&
    rule.holidayExclusive &&
    rule.enabled
  );
}

/**
 * Every other exclusive holiday rule that claims a date of the saved rule, with the first
 * date it claims (in the order of the saved dates, then of `others`). A date counts when it
 * is the same calendar date, or the same month and day when either of them repeats every
 * year. Two exclusive holidays on one date would leave the surcharge undefined.
 */
export function findHolidayConflicts(
  saved: { dates: readonly string[]; yearly: boolean },
  others: readonly PriceRuleRecord[],
): PriceRuleHolidayConflict[] {
  const conflicts: PriceRuleHolidayConflict[] = [];
  const seen = new Set<string>();
  for (const date of [...saved.dates].sort()) {
    for (const other of others) {
      if (seen.has(other.id)) continue;
      const otherDates = other.dates.map((item) =>
        TimeUtils.dateOnlyStr(item.date),
      );
      const claimed =
        saved.yearly || other.yearly
          ? otherDates.some((item) => monthDay(item) === monthDay(date))
          : otherDates.includes(date);
      if (claimed) {
        seen.add(other.id);
        conflicts.push({ ruleId: other.id, ruleName: other.name, date });
      }
    }
  }
  return conflicts;
}

/** First conflict of findHolidayConflicts: the one a save is refused for. */
export function findHolidayConflict(
  saved: { dates: readonly string[]; yearly: boolean },
  others: readonly PriceRuleRecord[],
): PriceRuleHolidayConflict | null {
  return findHolidayConflicts(saved, others)[0] ?? null;
}
