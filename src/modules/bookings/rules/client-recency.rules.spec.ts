import { TimeService } from '../../../shared/time/time.service.js';
import {
  CLIENT_RECENCY_BOUNDS,
  DORMANT_CLIENT_MIN_DAYS,
  isDormantRecencyBucket,
  matchesRecencyBound,
  recencyCutoff,
} from './client-recency.rules.js';
import { ClientRecencyBucket } from '../enums/client-recency-bucket.enum.js';

const TZ = 'Europe/Moscow';

describe('client recency bounds', () => {
  it('partitions ages without gaps or a bucket that straddles the dormant line', () => {
    expect(CLIENT_RECENCY_BOUNDS.length).toBeGreaterThan(0);
    for (let i = 0; i < CLIENT_RECENCY_BOUNDS.length; i++) {
      const bound = CLIENT_RECENCY_BOUNDS[i];
      const next = CLIENT_RECENCY_BOUNDS[i + 1];
      const below =
        bound.maxDays != null && bound.maxDays <= DORMANT_CLIENT_MIN_DAYS;
      const above = bound.minDays >= DORMANT_CLIENT_MIN_DAYS;
      expect(below || above).toBe(true);
      if (!next) {
        expect(bound.maxDays).toBeNull();
        continue;
      }
      expect(bound.maxDays).toBe(next.minDays);
    }
  });

  it('puts a visit on the 30th calendar day into 30–60, not outside the chart', () => {
    const asOf = TimeService.zonedDayStart(2026, 10, 1, 'UTC');
    const visit = TimeService.zonedHourStart(2026, 9, 1, 15, 'UTC');
    const matched = CLIENT_RECENCY_BOUNDS.filter((bound) =>
      matchesRecencyBound(visit, asOf, bound, 'UTC'),
    );
    expect(matched.map((bound) => bound.bucket)).toEqual([
      ClientRecencyBucket.DAYS_30_60,
    ]);
    expect(isDormantRecencyBucket(ClientRecencyBucket.DAYS_30_60)).toBe(false);
  });

  it('treats the cutoff instant as not yet old enough', () => {
    const asOf = TimeService.zonedDayStart(2026, 10, 1, 'UTC');
    const cutoff = recencyCutoff(asOf, 30, 'UTC');
    const bound = CLIENT_RECENCY_BOUNDS[0];
    expect(matchesRecencyBound(cutoff, asOf, bound, 'UTC')).toBe(false);
    expect(
      matchesRecencyBound(new Date(cutoff.getTime() - 1), asOf, bound, 'UTC'),
    ).toBe(true);
  });

  it('assigns each past calendar day to one bucket once the client has been quiet for 30 days', () => {
    const asOf = TimeService.zonedDayStart(2026, 10, 1, TZ);
    for (let daysAgo = 0; daysAgo <= 120; daysAgo++) {
      const visit = TimeService.zonedHourStart(2026, 10, 1 - daysAgo, 15, TZ);
      const matched = CLIENT_RECENCY_BOUNDS.filter((bound) =>
        matchesRecencyBound(visit, asOf, bound, TZ),
      );
      if (daysAgo < 30) {
        expect(matched).toHaveLength(0);
        continue;
      }
      expect(matched).toHaveLength(1);
      expect(isDormantRecencyBucket(matched[0].bucket)).toBe(
        daysAgo >= DORMANT_CLIENT_MIN_DAYS,
      );
    }
  });
});
