import { AggregateSnapshot } from '../../../bookings/interfaces/aggregate-snapshot.interface.js';
import { ServiceCount } from '../../../bookings/interfaces/service-count.interface.js';
import { SeriesRow } from '../../../bookings/interfaces/series-row.interface.js';
import { ResolvedRange } from '../../../dashboard/interfaces/resolved-range.interface.js';

export interface ServicesAnalyticsContext {
  locationId: string;
  range: ResolvedRange;
  // Batched sources so overlapping widgets share the same queries.
  currentSnapshot: AggregateSnapshot;
  previousSnapshot?: AggregateSnapshot;
  currentSeries: SeriesRow[];
  currentServiceCounts?: ServiceCount[];
}
