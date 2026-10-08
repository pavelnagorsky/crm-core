import { TimeService } from '../../../shared/time/time.service.js';
import { ClientRecencyBucket } from '../enums/client-recency-bucket.enum.js';
import { ClientRecencyBound } from '../interfaces/client-recency-bound.interface.js';

/** Clients at least this many calendar days since their last completed visit are the dormant headline. */
export const DORMANT_CLIENT_MIN_DAYS = 60;

/**
 * Recency buckets are contiguous and half-open on age: [minDays, maxDays).
 * The last bucket has no upper bound. Every bucket sits entirely below or
 * entirely at/above {@link DORMANT_CLIENT_MIN_DAYS} so the headline is a sum of buckets.
 */
export const CLIENT_RECENCY_BOUNDS: readonly ClientRecencyBound[] = [
  { bucket: ClientRecencyBucket.DAYS_30_60, minDays: 30, maxDays: 60 },
  { bucket: ClientRecencyBucket.DAYS_60_90, minDays: 60, maxDays: 90 },
  { bucket: ClientRecencyBucket.DAYS_90_PLUS, minDays: 90, maxDays: null },
];

/**
 * First instant at which a visit is not yet `days` calendar days old, in the
 * business timezone. A last visit strictly before this instant is at least
 * `days` calendar days before `asOf`.
 */
export function recencyCutoff(
  asOf: Date,
  days: number,
  timezone: string,
): Date {
  return TimeService.addDaysInTz(asOf, 1 - days, timezone);
}

/**
 * True when `lastVisit` falls in `bound`, measured in calendar days from `asOf`.
 * SQL in `BookingsAggregatesService.clientRecency` must stay equivalent:
 * age >= minDays iff lastVisit < recencyCutoff(asOf, minDays),
 * age < maxDays iff lastVisit >= recencyCutoff(asOf, maxDays).
 */
export function matchesRecencyBound(
  lastVisit: Date,
  asOf: Date,
  bound: ClientRecencyBound,
  timezone: string,
): boolean {
  if (
    lastVisit.getTime() >=
    recencyCutoff(asOf, bound.minDays, timezone).getTime()
  )
    return false;
  if (bound.maxDays == null) return true;
  return (
    lastVisit.getTime() >=
    recencyCutoff(asOf, bound.maxDays, timezone).getTime()
  );
}

export function isClientRecencyBucket(
  value: string,
): value is ClientRecencyBucket {
  return (Object.values(ClientRecencyBucket) as string[]).includes(value);
}

export function isDormantRecencyBucket(bucket: ClientRecencyBucket): boolean {
  const bound = CLIENT_RECENCY_BOUNDS.find((item) => item.bucket === bucket);
  return bound !== undefined && bound.minDays >= DORMANT_CLIENT_MIN_DAYS;
}
