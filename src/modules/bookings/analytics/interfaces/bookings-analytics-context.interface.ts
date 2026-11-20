import { Prisma } from '@prisma/client';
import { AggregateSnapshot } from '../../interfaces/aggregate-snapshot.interface.js';
import { ResolvedRange } from '../../../dashboard/interfaces/resolved-range.interface.js';
import { OccupancyData } from './occupancy-data.interface.js';
import { TrafficSourceTotals } from '../../interfaces/traffic-source-totals.interface.js';
import { TrafficSourceViews } from '../../../booking-traffic/interfaces/traffic-source-views.interface.js';
import { OccupancyHeadline } from './occupancy-headline.interface.js';

export interface BookingsAnalyticsContext {
  range: ResolvedRange;
  // Batched sources so overlapping widgets share the same queries; undefined means not requested.
  pastSnapshot?: AggregateSnapshot;
  previousVisitsHeld?: number;
  lostRevenue?: Prisma.Decimal;
  previousLostRevenue?: Prisma.Decimal;
  pendingCount?: number;
  occupancy?: OccupancyData;
  previousOccupancy?: OccupancyHeadline;
  trafficTotals?: TrafficSourceTotals;
  /** Views by source; null under a staff filter, where they are not known. */
  trafficViews?: TrafficSourceViews[] | null;
}
