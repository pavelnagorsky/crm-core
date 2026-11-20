import { TrafficSourceTotalsRow } from './traffic-source-totals-row.interface.js';

/** Bookings created in a period by source, by source and detail, and in total. */
export interface TrafficSourceTotals {
  sources: TrafficSourceTotalsRow[];
  /** Rows with a detail only; bookings without a detail count in their source row. */
  details: TrafficSourceTotalsRow[];
  total: TrafficSourceTotalsRow;
}
