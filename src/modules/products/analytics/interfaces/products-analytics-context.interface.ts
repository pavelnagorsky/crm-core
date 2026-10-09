import { AggregateSnapshot } from '../../../bookings/interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from '../../../bookings/interfaces/series-row.interface.js';
import { ProductSalesKpiSeriesRow } from '../../../orders/analytics/interfaces/product-sales-kpi-series-row.interface.js';
import { ProductSalesKpiSnapshot } from '../../../orders/analytics/interfaces/product-sales-kpi-snapshot.interface.js';
import { ResolvedRange } from '../../../dashboard/interfaces/resolved-range.interface.js';

export interface ProductsAnalyticsContext {
  range: ResolvedRange;
  currentProductSnapshot: ProductSalesKpiSnapshot;
  previousProductSnapshot?: ProductSalesKpiSnapshot;
  currentProductSeries: ProductSalesKpiSeriesRow[];
  currentServiceSnapshot?: AggregateSnapshot;
  previousServiceSnapshot?: AggregateSnapshot;
  currentServiceSeries: SeriesRow[];
}
