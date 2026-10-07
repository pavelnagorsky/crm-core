import { SeriesGranularity } from '../../../dashboard/enums/series-granularity.enum.js';
import { ClientSalesRange } from './client-sales-range.interface.js';

export interface ClientSalesSeriesRange extends ClientSalesRange {
  granularity: SeriesGranularity;
  timezone: string;
}
