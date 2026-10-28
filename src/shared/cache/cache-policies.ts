export const CATALOG_CACHE_POLICY = {
  ttlMs: 24 * 60 * 60_000,
  refreshAheadMs: 2 * 60 * 60_000,
  warmup: true,
};

export const SETTINGS_CACHE_POLICY = CATALOG_CACHE_POLICY;
