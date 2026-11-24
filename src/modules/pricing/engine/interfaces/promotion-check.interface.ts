import { CalendarDay } from '../compile/interfaces/calendar-day.interface.js';
import { QuoteContext } from './quote-context.interface.js';

/** Visit facts the own conditions of a promotion are checked against. */
export interface PromotionCheck {
  context: QuoteContext;
  /** Local visit date. */
  day: CalendarDay;
  /** Staff of the line, or of every line of a FIXED bundle. */
  staffIds: readonly (string | null)[];
  /** Sum of the list prices of the visit, minor units. */
  visitListTotal: number;
}
