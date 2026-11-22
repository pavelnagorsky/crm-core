/**
 * The TTL is the only safeguard when an invalidation is lost: the process dies between the commit and
 * `invalidate`, or Redis is unavailable at that moment. Keep it short enough to bound that staleness.
 */
export const CATALOG_CACHE_POLICY = {
  ttlMs: 60 * 60_000,
  refreshAheadMs: 10 * 60_000,
};

export const SETTINGS_CACHE_POLICY = CATALOG_CACHE_POLICY;

/**
 * Billing state is recomputed from dates on every read. The cache is shared by replicas through Redis;
 * the TTL only bounds staleness after a lost invalidation (crash before `invalidate`, Redis unavailable).
 */
export const BILLING_CACHE_POLICY = {
  ttlMs: 5 * 60_000,
  refreshAheadMs: 60_000,
};
