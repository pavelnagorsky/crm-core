import { CompiledRule } from '../compiled-rule.js';
import { CalendarDay } from './calendar-day.interface.js';

/** Enabled rules whose date conditions (period, weekday, holiday) hold on a day. */
export interface DayRules {
  day: CalendarDay;
  rules: CompiledRule[];
}
