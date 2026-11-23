import { CacheReadResult } from './cache-read-result.interface.js';

/** Shared storage of cache entries and invalidation revisions. Every method may reject when the store is down. */
export interface CacheStore {
  readonly available: boolean;
  /** Drops and misses an entry that an invalidation made stale. */
  read(key: string): Promise<CacheReadResult>;
  /** Stores nothing and resolves false when a dependency was invalidated after `revision`. */
  write(
    key: string,
    revision: number,
    dependencies: readonly string[],
    payload: string,
    ttlMs: number,
  ): Promise<boolean>;
  invalidate(dependency: string): Promise<void>;
}
