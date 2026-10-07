import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { ResolvedRange } from './resolved-range.interface.js';
import { AggregateSnapshot } from '../../bookings/interfaces/aggregate-snapshot.interface.js';
import { HeatmapCell } from '../../bookings/interfaces/heatmap-cell.interface.js';
import { SeriesRow } from '../../bookings/interfaces/series-row.interface.js';
import { SourceCount } from '../../bookings/interfaces/source-count.interface.js';
import { StaffCount } from '../../bookings/interfaces/staff-count.interface.js';
import { ProductSalesSeriesRow } from '../../orders/analytics/interfaces/product-sales-series-row.interface.js';
import { ProductSalesSnapshot } from '../../orders/analytics/interfaces/product-sales-snapshot.interface.js';
import { ProductSalesStaffRow } from '../../orders/analytics/interfaces/product-sales-staff-row.interface.js';

export interface DashboardReadContext {
  locationId: string;
  dto: DashboardWidgetsRequestDto;
  range: ResolvedRange;
  bookingSnapshot: AggregateSnapshot;
  previousBookingSnapshot?: AggregateSnapshot;
  bookingSeries: SeriesRow[];
  previousBookingSeries: SeriesRow[];
  productSnapshot: ProductSalesSnapshot;
  previousProductSnapshot?: ProductSalesSnapshot;
  productSeries: ProductSalesSeriesRow[];
  previousProductSeries: ProductSalesSeriesRow[];
  sourceRows: SourceCount[];
  heatmapCells: HeatmapCell[];
  staffRevenueRows: StaffCount[];
  staffCompletedRows: StaffCount[];
  productStaffRows: ProductSalesStaffRow[];
}
