import { VisitTime } from '../../pricing/engine/interfaces/visit-time.interface.js';

/** When a selection is priced: at one visit start (exact), or over the online booking days (range). */
export interface BookingPriceWindow {
  /** Visit start; when set the price is exact and the dates are ignored. */
  visit: VisitTime | null;
  /** Local dates of the online booking window, YYYY-MM-DD. */
  dates: readonly string[];
}
