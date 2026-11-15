export const CATALOG_CACHE_POLICY = {
  ttlMs: 24 * 60 * 60_000,
  refreshAheadMs: 2 * 60 * 60_000,
};

export const SETTINGS_CACHE_POLICY = CATALOG_CACHE_POLICY;

/** Billing state is recomputed from dates on every read; the TTL only bounds staleness across replicas. */
export const BILLING_CACHE_POLICY = {
  ttlMs: 5 * 60_000,
  refreshAheadMs: 60_000,
};
