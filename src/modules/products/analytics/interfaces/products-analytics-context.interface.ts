import { Prisma } from '@prisma/client';
import { AggregateSnapshot } from '../../../bookings/interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from '../../../bookings/interfaces/series-row.interface.js';
import { ProductSalesKpiSeriesRow } from '../../../orders/aggregates/interfaces/product-sales-kpi-series-row.interface.js';
import { ProductSalesKpiSnapshot } from '../../../orders/aggregates/interfaces/product-sales-kpi-snapshot.interface.js';
import { ResolvedBrandRange } from '../../../dashboard/interfaces/resolved-brand-range.interface.js';
import { ProductSalesSeriesRow } from '../../../orders/aggregates/interfaces/product-sales-series-row.interface.js';

export interface ProductsAnalyticsContext {
  range: ResolvedBrandRange;
  currentProductSnapshot: ProductSalesKpiSnapshot;
  previousProductSnapshot?: ProductSalesKpiSnapshot;
  currentProductSeries: ProductSalesKpiSeriesRow[];
  currentAllProductRevenue: Prisma.Decimal;
  previousAllProductRevenue?: Prisma.Decimal;
  currentAllProductSeries: ProductSalesSeriesRow[];
  currentServiceSnapshot?: AggregateSnapshot;
  previousServiceSnapshot?: AggregateSnapshot;
  currentServiceSeries: SeriesRow[];
}
