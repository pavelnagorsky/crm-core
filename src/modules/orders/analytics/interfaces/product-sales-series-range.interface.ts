import { SeriesGranularity } from '../../../dashboard/enums/series-granularity.enum.js';
import { ProductSalesRange } from './product-sales-range.interface.js';

export interface ProductSalesSeriesRange extends ProductSalesRange {
  granularity: SeriesGranularity;
  timezone: string;
}
