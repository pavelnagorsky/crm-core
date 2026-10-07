import { ResolvedBrandRange } from '../../../dashboard/interfaces/resolved-brand-range.interface.js';
import { ClientCohortBucket } from '../../../bookings/interfaces/client-cohort-bucket.interface.js';
import { ClientCohortSummary } from '../../../bookings/interfaces/client-cohort-summary.interface.js';
import { ClientRecencyRow } from '../../../bookings/interfaces/client-recency-row.interface.js';

export interface ClientAnalyticsContext {
  range: ResolvedBrandRange;
  currentCohort?: ClientCohortSummary;
  previousCohort?: ClientCohortSummary;
  currentSeries: ClientCohortBucket[];
  previousSeries: ClientCohortBucket[];
  currentRecency: ClientRecencyRow[];
  previousRecency?: ClientRecencyRow[];
}
