import { BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { AggregateSnapshot } from '../../bookings/interfaces/aggregate-snapshot.interface.js';
import { SeriesRow } from '../../bookings/interfaces/series-row.interface.js';
import { ProductSalesSeriesRow } from '../../orders/analytics/interfaces/product-sales-series-row.interface.js';
import { ProductSalesSnapshot } from '../../orders/analytics/interfaces/product-sales-snapshot.interface.js';
import { DashboardWidgetsRequestDto } from '../dto/dashboard-widgets-request.dto.js';
import { DashboardWidgetKey } from '../enums/dashboard-widget-key.enum.js';

export function wants(
  selected: ReadonlySet<DashboardWidgetKey>,
  group: ReadonlySet<DashboardWidgetKey>,
): boolean {
  for (const key of group) if (selected.has(key)) return true;
  return false;
}

export function windowRange(
  locationId: string,
  dto: DashboardWidgetsRequestDto,
  from: Date,
  to: Date,
) {
  return {
    locationId,
    from,
    to,
    staffId: dto.staffId,
    catalogItemId: dto.catalogItemId,
    categoryId: dto.categoryId,
  };
}

export function sumCount(
  snap: AggregateSnapshot,
  statuses: BookingStatus[] | undefined,
): number {
  if (!statuses) return snap.totalCount;
  let sum = 0;
  for (const s of statuses) sum += snap.byStatus.get(s)?.count ?? 0;
  return sum;
}

export function sumRevenue(
  snap: AggregateSnapshot,
  statuses: BookingStatus[] | undefined,
): Prisma.Decimal {
  if (!statuses) return snap.totalRevenue;
  let sum = MoneyUtils.decimal(0);
  for (const s of statuses) sum = sum.plus(snap.byStatus.get(s)?.revenue ?? 0);
  return sum;
}

export function chartMoney(value: Prisma.Decimal): number {
  return Number(MoneyUtils.format(value));
}

export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? +((part / whole) * 100).toFixed(1) : 0;
}

export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  let sum = MoneyUtils.decimal(0);
  for (const v of values) sum = sum.plus(v);
  return sum;
}

export function commercialEventCount(
  completedBookings: number,
  productSales: ProductSalesSnapshot,
): number {
  return (
    completedBookings +
    productSales.standaloneOrderCount +
    productSales.extraLinkedBookingCount
  );
}

export function collapseSeries(
  rows: SeriesRow[],
  statuses?: BookingStatus[],
): SeriesRow[] {
  const byBucket = new Map<number, SeriesRow>();
  for (const row of rows) {
    if (statuses && (row.status == null || !statuses.includes(row.status))) {
      continue;
    }
    const key = row.bucket.getTime();
    const existing = byBucket.get(key);
    if (existing) {
      existing.count += row.count;
      existing.revenue = existing.revenue.plus(row.revenue);
      existing.duration += row.duration;
    } else {
      byBucket.set(key, { ...row, status: null });
    }
  }
  return [...byBucket.values()];
}

export function emptySnapshot(): AggregateSnapshot {
  return {
    byStatus: new Map(),
    totalCount: 0,
    totalRevenue: MoneyUtils.decimal(0),
    totalDuration: 0,
  };
}

export function emptyProductSnapshot(): ProductSalesSnapshot {
  return {
    revenue: MoneyUtils.decimal(0),
    standaloneOrderCount: 0,
    extraLinkedBookingCount: 0,
  };
}

export function mergeRevenueSeries(
  bookingRows: SeriesRow[],
  productRows: ProductSalesSeriesRow[],
): SeriesRow[] {
  const byBucket = new Map<number, SeriesRow>();
  for (const row of bookingRows) {
    const key = row.bucket.getTime();
    const existing = byBucket.get(key);
    if (existing) {
      existing.revenue = existing.revenue.plus(row.revenue);
      existing.count += row.count;
      existing.duration += row.duration;
    } else {
      byBucket.set(key, { ...row, status: null });
    }
  }
  for (const row of productRows) {
    const key = row.bucket.getTime();
    const existing = byBucket.get(key);
    if (existing) {
      existing.revenue = existing.revenue.plus(row.revenue);
    } else {
      byBucket.set(key, {
        bucket: row.bucket,
        status: null,
        count: 0,
        revenue: row.revenue,
        duration: 0,
      });
    }
  }
  return [...byBucket.values()].sort(
    (left, right) => left.bucket.getTime() - right.bucket.getTime(),
  );
}

export function sourceLabel(s: BookingSource): string {
  switch (s) {
    case BookingSource.PUBLIC_PAGE:
      return 'Public page';
    case BookingSource.WIDGET:
      return 'Widget';
    case BookingSource.MANUAL:
      return 'Manual';
    case BookingSource.WALK_IN:
      return 'Walk-in';
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}
