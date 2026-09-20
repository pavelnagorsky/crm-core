import { SeriesGranularity } from '../enums/series-granularity.enum.js';

export interface ResolvedRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  granularity: SeriesGranularity;
  timezone: string;
  currency: string;
  compareWithPrevious: boolean;
}
