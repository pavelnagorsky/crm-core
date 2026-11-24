import { PriceScheduleType } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PRICE_RULE_NEXT_DATE_HORIZON_DAYS } from '../constants/price-rule.constants.js';
import { CalendarDayParser } from '../engine/compile/calendar-day.parser.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import { PriceScheduleType as EngineScheduleType } from '../engine/enums/price-schedule-type.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PriceRuleStatus } from '../enums/price-rule-status.enum.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { toPricingRuleEntry } from './price-rule-entry.rules.js';

const monthDay = (date: string): string => date.slice(5);

/**
 * Nearest local date, today included, on which the rule works by its period, weekdays and
 * holiday dates; null when none is left. Time of day and targets are not looked at. The
 * date conditions are the engine's own, so the answer matches what a quote does.
 */
export function nextRuleDate(
  entry: PricingRuleEntry,
  today: string,
): string | null {
  const rule = new CompiledRule({ ...entry, enabled: true });
  if (entry.scheduleType === EngineScheduleType.HOLIDAYS && !entry.yearly)
    return (
      [...entry.dates]
        .sort()
        .find(
          (date) =>
            date >= today && rule.coversDay(CalendarDayParser.parse(date)),
        ) ?? null
    );
  let date =
    !entry.yearly && entry.visitFrom && entry.visitFrom > today
      ? entry.visitFrom
      : today;
  for (let step = 0; step < PRICE_RULE_NEXT_DATE_HORIZON_DAYS; step += 1) {
    if (!entry.yearly && entry.visitTo && date > entry.visitTo) return null;
    if (rule.coversDay(CalendarDayParser.parse(date))) return date;
    date = TimeUtils.addDaysStr(date, 1);
  }
  return null;
}

/** True when today lies inside the period of a rule without holiday dates. */
function periodIncludes(entry: PricingRuleEntry, today: string): boolean {
  const { visitFrom, visitTo } = entry;
  if (entry.scheduleType === EngineScheduleType.SEASON && entry.yearly) {
    const key = monthDay(today);
    const from = visitFrom ? monthDay(visitFrom) : '01-01';
    const to = visitTo ? monthDay(visitTo) : '12-31';
    // A season may cross the new year (15.12 - 10.01).
    return from > to ? key >= from || key <= to : key >= from && key <= to;
  }
  return (
    (visitFrom === null || visitFrom <= today) &&
    (visitTo === null || visitTo >= today)
  );
}

/** Status of a rule today of the location. */
export function priceRuleStatus(
  rule: PriceRuleRecord,
  today: string,
  nextDate: string | null,
): PriceRuleStatus {
  if (rule.archivedAt !== null) return PriceRuleStatus.ARCHIVED;
  if (!rule.enabled) return PriceRuleStatus.DISABLED;
  if (rule.scheduleType === PriceScheduleType.HOLIDAYS) {
    if (nextDate === today) return PriceRuleStatus.ACTIVE;
    return nextDate === null
      ? PriceRuleStatus.ENDED
      : PriceRuleStatus.SCHEDULED;
  }
  const entry = toPricingRuleEntry(rule);
  // A promotion also needs its booking period: once it is over nobody can book with it.
  const promotion = entry.promotion;
  if (promotion) {
    if (promotion.bookingTo !== null && promotion.bookingTo < today)
      return PriceRuleStatus.ENDED;
    if (entry.visitTo !== null && entry.visitTo < today)
      return PriceRuleStatus.ENDED;
    if (nextDate === null) return PriceRuleStatus.ENDED;
    if (promotion.bookingFrom !== null && promotion.bookingFrom > today)
      return PriceRuleStatus.SCHEDULED;
  }
  if (periodIncludes(entry, today)) return PriceRuleStatus.ACTIVE;
  // A yearly season outside its months comes back next year.
  if (entry.yearly) return PriceRuleStatus.SCHEDULED;
  return entry.visitTo !== null && entry.visitTo < today
    ? PriceRuleStatus.ENDED
    : PriceRuleStatus.SCHEDULED;
}

/** Status and next date of a rule; a rule that is not in force has no next date. */
export function priceRuleSchedule(
  rule: PriceRuleRecord,
  today: string,
): { status: PriceRuleStatus; nextDate: string | null } {
  const nextDate = nextRuleDate(toPricingRuleEntry(rule), today);
  const status = priceRuleStatus(rule, today, nextDate);
  const inForce =
    status === PriceRuleStatus.ACTIVE || status === PriceRuleStatus.SCHEDULED;
  return { status, nextDate: inForce ? nextDate : null };
}
