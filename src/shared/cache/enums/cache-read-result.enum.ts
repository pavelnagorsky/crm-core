/** How `AppCacheService.getOrLoad` served a read: the `result` label of `klendo_cache_reads_total`. */
export enum CacheReadResult {
  HIT = 'hit',
  /** Not cached, or cached but not usable: loaded from the database. */
  MISS = 'miss',
  /** The store is unavailable (Redis down): loaded without trying the cache. */
  BYPASS = 'bypass',
  /** The store failed the read: loaded without the cache. */
  ERROR = 'error',
}
