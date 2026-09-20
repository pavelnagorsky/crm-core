import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { SeriesRow } from '../../bookings/interfaces/series-row.interface.js';
import { WidgetSeriesPointDto } from '../dto/widget-series-point.dto.js';
import { ResolvedRange } from '../interfaces/resolved-range.interface.js';
import { DashboardBucketService } from './dashboard-bucket.service.js';

@Injectable()
export class DashboardSeriesFactory {
  constructor(private readonly buckets: DashboardBucketService) {}

  /**
   * Aligns rows to the current period's buckets and projects each row into named values.
   * Empty buckets get an object with all known keys set to 0.
   */
  fillSingle(
    range: ResolvedRange,
    rows: SeriesRow[],
    valueKey: string,
    field: 'revenue' | 'count',
  ): WidgetSeriesPointDto[] {
    return this.fillOnBuckets(this.buckets.bucketStarts(range), rows, valueKey, field);
  }

  /**
   * Same as fillSingle but on the previous period's buckets, positionally aligned to current.
   */
  fillComparison(
    range: ResolvedRange,
    rows: SeriesRow[],
    valueKey: string,
    field: 'revenue' | 'count',
  ): WidgetSeriesPointDto[] {
    const buckets = this.buckets.bucketStartsForBounds(range.previousFrom, range.previousTo, range.granularity, range.timezone);
    return this.fillOnBuckets(buckets, rows, valueKey, field);
  }

  /**
   * Splits rows into named series keyed by status, filling gaps with zeros. Ensures every point
   * has the same set of keys drawn from `keys` so the frontend can build stable series.
   */
  fillByStatus(range: ResolvedRange, rows: SeriesRow[], keys: Set<string>): WidgetSeriesPointDto[] {
    return this.fillByStatusOn(this.buckets.bucketStarts(range), rows, keys);
  }

  fillByStatusComparison(range: ResolvedRange, rows: SeriesRow[], keys: Set<string>): WidgetSeriesPointDto[] {
    const buckets = this.buckets.bucketStartsForBounds(range.previousFrom, range.previousTo, range.granularity, range.timezone);
    return this.fillByStatusOn(buckets, rows, keys);
  }

  /**
   * Extracts a spark series (raw numbers, positionally aligned with current buckets).
   */
  spark(range: ResolvedRange, rows: SeriesRow[], field: 'revenue' | 'count'): number[] {
    const buckets = this.buckets.bucketStarts(range);
    const byBucket = this.indexByBucket(rows);
    return buckets.map((b) => {
      const row = byBucket.get(b.getTime());
      if (!row) return 0;
      return field === 'revenue' ? row.revenue : row.count;
    });
  }

  /**
   * Collects the union of status keys present in both current and previous rows. Used to align
   * comparison series so every point has the same set of value keys.
   */
  collectStatusKeys(rows: SeriesRow[], statusKey: (s: BookingStatus | null) => string): Set<string> {
    return new Set(rows.map((r) => statusKey(r.status)));
  }

  private fillOnBuckets(
    buckets: Date[],
    rows: SeriesRow[],
    valueKey: string,
    field: 'revenue' | 'count',
  ): WidgetSeriesPointDto[] {
    const byBucket = this.indexByBucket(rows);
    return buckets.map((b) => {
      const row = byBucket.get(b.getTime());
      const raw = row ? (field === 'revenue' ? row.revenue : row.count) : 0;
      return { t: b.toISOString(), values: { [valueKey]: raw } };
    });
  }

  private fillByStatusOn(buckets: Date[], rows: SeriesRow[], keys: Set<string>): WidgetSeriesPointDto[] {
    const map = new Map<number, Map<string, number>>();
    for (const r of rows) {
      const k = (r.status ?? 'unknown').toString().toLowerCase();
      const inner = map.get(r.bucket.getTime()) ?? new Map<string, number>();
      inner.set(k, (inner.get(k) ?? 0) + r.count);
      map.set(r.bucket.getTime(), inner);
    }
    return buckets.map((b) => {
      const inner = map.get(b.getTime());
      const values: Record<string, number> = {};
      for (const k of keys) values[k] = inner?.get(k) ?? 0;
      return { t: b.toISOString(), values };
    });
  }

  private indexByBucket(rows: SeriesRow[]): Map<number, SeriesRow> {
    const out = new Map<number, SeriesRow>();
    for (const r of rows) out.set(r.bucket.getTime(), r);
    return out;
  }
}
