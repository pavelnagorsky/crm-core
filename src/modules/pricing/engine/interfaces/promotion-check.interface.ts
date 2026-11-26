import { CalendarDay } from '../compile/interfaces/calendar-day.interface.js';
import { QuoteContext } from './quote-context.interface.js';

/** Visit facts the own conditions of a promotion are checked against. */
export interface PromotionCheck {
  context: QuoteContext;
  /** Local visit date (the sale date for a sale). */
  day: CalendarDay;
  /** Staff of the line, or of every line of a FIXED bundle; the seller of a product line. */
  staffIds: readonly (string | null)[];
  /** Sum of the list prices of the visit or the sale, minor units. */
  visitListTotal: number;
  /** A sale without a visit: lead time conditions never hold (NO_VISIT). */
  noVisit?: boolean;
}
