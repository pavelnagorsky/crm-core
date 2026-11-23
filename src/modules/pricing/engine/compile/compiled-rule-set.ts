import { VisitTime } from '../interfaces/visit-time.interface.js';
import { CalendarDayParser } from './calendar-day.parser.js';
import { CompiledRule } from './compiled-rule.js';
import { DayRules } from './interfaces/day-rules.interface.js';

/**
 * Compiled surcharge rules of a location in display order (createdAt, then id). Date
 * conditions are evaluated once per date and cached: a PriceBook lives for one request, so
 * the cache is bounded by the dates that request touches.
 */
export class CompiledRuleSet {
  private readonly days = new Map<string, DayRules>();

  constructor(readonly rules: readonly CompiledRule[]) {}

  get isEmpty(): boolean {
    return this.rules.length === 0;
  }

  /** Enabled rules whose period, weekday and holiday conditions hold on this date. */
  onDate(date: string): DayRules {
    let dayRules = this.days.get(date);
    if (!dayRules) {
      const day = CalendarDayParser.parse(date);
      dayRules = {
        day,
        rules: this.rules.filter((rule) => rule.coversDay(day)),
      };
      this.days.set(date, dayRules);
    }
    return dayRules;
  }

  /** Rules whose time conditions hold for a visit starting at this local date and minute. */
  activeAt(visit: VisitTime): CompiledRule[] {
    if (this.isEmpty) return [];
    return this.onDate(visit.date).rules.filter((rule) =>
      rule.coversMinute(visit.minute),
    );
  }
}
