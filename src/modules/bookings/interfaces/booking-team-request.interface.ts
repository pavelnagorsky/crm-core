import { PriceBook } from '../../pricing/engine/price-book.js';
import { BookingScheduleRequest } from './booking-schedule-request.interface.js';

/**
 * Who the "any staff" rule gives each item. With a start, as booking creation assigns them;
 * without one, every qualified staff member counts as free and has no day load.
 */
export interface BookingTeamRequest extends Omit<
  BookingScheduleRequest,
  'startAt'
> {
  startAt: Date | null;
  /** The snapshot the caller quotes with, so ranking and quote cannot disagree. */
  book?: PriceBook;
  /**
   * Price check: one staff member takes every item (free for each of them), ranked by the
   * price of the whole visit.
   */
  oneStaffForAll?: boolean;
}
