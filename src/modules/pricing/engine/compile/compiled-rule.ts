import { PriceRuleKind } from '../enums/price-rule-kind.enum.js';
import { PriceRuleSkipReason } from '../enums/price-rule-skip-reason.enum.js';
import { PriceScheduleType } from '../enums/price-schedule-type.enum.js';
import { PriceValueType } from '../enums/price-value-type.enum.js';
import { PricingRuleEntry } from '../interfaces/pricing-rule-entry.interface.js';
import { CalendarDayParser } from './calendar-day.parser.js';
import { CompiledPromotion } from './compiled-promotion.js';
import { CalendarDay } from './interfaces/calendar-day.interface.js';
import { RuleTargetContext } from './interfaces/rule-target-context.interface.js';
import { RuleTargetSets } from './rule-target-sets.js';

const MINUTES_PER_DAY = 1440;

/**
 * A price rule in the form the checks need (docs/pricing-stage3-api.md): numeric date
 * keys, a weekday mask, sorted intervals and target sets. Built once per PriceBook; every
 * check is a comparison or a Set lookup. A promotion also carries its own conditions.
 */
export class CompiledRule {
  readonly id: string;
  readonly kind: PriceRuleKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly valueType: PriceValueType;
  readonly value: number;
  readonly holidayExclusive: boolean;
  readonly createdAt: string;
  /** Set for PROMOTION, null for SURCHARGE. */
  readonly promotion: CompiledPromotion | null;
  /** Interval edges inside the day (0 < edge < 1440), where the price may change. */
  readonly breakpoints: readonly number[];

  private readonly weekdaysMask: number;
  /** Flat [start, end, start, end, ...], sorted; empty = the whole day. */
  private readonly intervals: readonly number[];
  /** Yearly ranges compare MMDD and may wrap over the new year; others compare YYYYMMDD. */
  private readonly periodYearly: boolean;
  private readonly periodFrom: number | null;
  private readonly periodTo: number | null;
  /** HOLIDAYS only: MMDD keys when yearly, YYYYMMDD otherwise. */
  private readonly holidays: ReadonlySet<number> | null;
  private readonly holidaysYearly: boolean;

  private readonly appliesToAll: boolean;
  private readonly included: RuleTargetSets;
  private readonly excluded: RuleTargetSets;

  constructor(entry: PricingRuleEntry) {
    this.id = entry.id;
    this.kind = entry.kind;
    this.name = entry.name;
    this.enabled = entry.enabled;
    this.valueType = entry.valueType;
    this.value = entry.value;
    this.holidayExclusive =
      entry.scheduleType === PriceScheduleType.HOLIDAYS &&
      entry.holidayExclusive;
    this.createdAt = entry.createdAt;
    if ((entry.kind === PriceRuleKind.PROMOTION) !== (entry.promotion !== null))
      throw new RangeError(
        `Rule ${entry.id}: promotion fields do not match the kind`,
      );
    this.promotion =
      entry.promotion === null
        ? null
        : new CompiledPromotion(entry.id, entry.promotion);
    this.weekdaysMask = entry.weekdaysMask;

    const intervals = [...entry.intervals].sort((a, b) => a.start - b.start);
    for (const { start, end } of intervals)
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        start >= end ||
        end > MINUTES_PER_DAY
      )
        throw new RangeError(`Rule ${entry.id}: invalid interval`);
    this.intervals = intervals.flatMap(({ start, end }) => [start, end]);
    this.breakpoints = [...new Set(this.intervals)].filter(
      (edge) => edge > 0 && edge < MINUTES_PER_DAY,
    );

    this.periodYearly =
      entry.scheduleType === PriceScheduleType.SEASON && entry.yearly;
    this.periodFrom = this.periodKey(entry.visitFrom);
    this.periodTo = this.periodKey(entry.visitTo);

    this.holidaysYearly = entry.yearly;
    this.holidays =
      entry.scheduleType === PriceScheduleType.HOLIDAYS
        ? new Set(
            entry.dates.map((date) => {
              const day = CalendarDayParser.parse(date);
              // A yearly 29 February matches only the 29 February of leap years.
              return entry.yearly ? day.md : day.ymd;
            }),
          )
        : null;

    this.appliesToAll = entry.appliesToAll;
    this.included = new RuleTargetSets();
    this.excluded = new RuleTargetSets();
    for (const target of entry.targets)
      (target.excluded ? this.excluded : this.included).add(
        target.type,
        target.id,
      );
  }

  /**
   * First reason the rule does not apply at this start, in explain order; targets aside.
   * Null: the rule covers this day and minute.
   */
  timeReason(day: CalendarDay, minute: number): PriceRuleSkipReason | null {
    if (!this.enabled) return PriceRuleSkipReason.DISABLED;
    if (!this.inPeriod(day)) return PriceRuleSkipReason.OUT_OF_PERIOD;
    if (!this.onWeekday(day)) return PriceRuleSkipReason.WRONG_WEEKDAY;
    if (!this.coversMinute(minute)) return PriceRuleSkipReason.OUT_OF_INTERVAL;
    if (!this.onHoliday(day)) return PriceRuleSkipReason.NOT_HOLIDAY_DATE;
    return null;
  }

  /** Enabled and every date condition holds: period, weekday, holiday date. */
  coversDay(day: CalendarDay): boolean {
    return (
      this.enabled &&
      this.inPeriod(day) &&
      this.onWeekday(day) &&
      this.onHoliday(day)
    );
  }

  /** start <= minute < end for some interval; no intervals = the whole day. */
  coversMinute(minute: number): boolean {
    const intervals = this.intervals;
    if (intervals.length === 0) return true;
    for (let index = 0; index < intervals.length; index += 2)
      if (minute >= intervals[index] && minute < intervals[index + 1])
        return true;
    return false;
  }

  /**
   * Null when the rule targets the context. A FIXED bundle context has no service: only
   * BUNDLE targets and "all" reach it. A SUM bundle line matches by its service, its
   * category or its bundle.
   */
  targetReason(context: RuleTargetContext): PriceRuleSkipReason | null {
    if (this.appliesToAll)
      return this.excluded.has(context)
        ? PriceRuleSkipReason.EXCLUDED
        : null;
    return this.included.has(context)
      ? null
      : PriceRuleSkipReason.NOT_TARGETED;
  }

  private inPeriod(day: CalendarDay): boolean {
    const key = this.periodYearly ? day.md : day.ymd;
    const from = this.periodFrom;
    const to = this.periodTo;
    if (this.periodYearly && from !== null && to !== null && from > to)
      return key >= from || key <= to;
    return (from === null || key >= from) && (to === null || key <= to);
  }

  private onWeekday(day: CalendarDay): boolean {
    return (
      this.weekdaysMask === 0 ||
      (this.weekdaysMask & (1 << (day.isoWeekday - 1))) !== 0
    );
  }

  private onHoliday(day: CalendarDay): boolean {
    return (
      this.holidays === null ||
      this.holidays.has(this.holidaysYearly ? day.md : day.ymd)
    );
  }

  private periodKey(date: string | null): number | null {
    if (date === null) return null;
    const day = CalendarDayParser.parse(date);
    return this.periodYearly ? day.md : day.ymd;
  }
}
