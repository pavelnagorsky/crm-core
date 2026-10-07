import { ClientCohortBucket } from './client-cohort-bucket.interface.js';
import { ClientCohortSummary } from './client-cohort-summary.interface.js';

export interface ClientCohortReport {
  summary: ClientCohortSummary;
  series: ClientCohortBucket[];
}
