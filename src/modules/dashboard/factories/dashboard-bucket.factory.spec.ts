import { SeriesGranularity } from '../enums/series-granularity.enum.js';
import { DashboardBucketFactory } from './dashboard-bucket.factory.js';

describe('DashboardBucketFactory timezone transitions', () => {
  const buckets = new DashboardBucketFactory();
  it.each([
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
  ])('enumerates every real hour between %s and %s', (from, to, count) => {
    const starts = buckets.bucketStartsForBounds(
      new Date(from),
      new Date(to),
      SeriesGranularity.HOUR,
      'America/New_York',
    );
    expect(starts).toHaveLength(count);
    expect(new Set(starts.map((date) => date.getTime())).size).toBe(count);
    for (let index = 1; index < starts.length; index++) {
      expect(starts[index].getTime() - starts[index - 1].getTime()).toBe(
        3_600_000,
      );
    }
  });
});
