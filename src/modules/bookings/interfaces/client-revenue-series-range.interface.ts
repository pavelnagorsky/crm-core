import { SeriesGranularity } from '../../dashboard/enums/series-granularity.enum.js';
import { ClientRevenueRange } from './client-revenue-range.interface.js';

export interface ClientRevenueSeriesRange extends ClientRevenueRange {
  granularity: SeriesGranularity;
  timezone: string;
}
