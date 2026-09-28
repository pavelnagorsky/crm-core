import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { ClientCohortRange } from './client-cohort-range.interface.js';

export interface ClientCohortSeriesRange extends ClientCohortRange {
  granularity: SeriesGranularity;
  timezone: string;
}
