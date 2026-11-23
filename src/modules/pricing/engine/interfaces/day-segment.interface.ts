import { VisitQuote } from './visit-quote.interface.js';

/** Part of a local day where a visit starting at any minute costs the same. */
export interface DaySegment {
  /** First minute of the segment, inclusive. */
  startMinute: number;
  /** End minute, exclusive; the last segment ends at 1440. */
  endMinute: number;
  /** Quote of a visit starting at startMinute. */
  quote: VisitQuote;
}
