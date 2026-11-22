import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { CacheReadResult } from '../interfaces/cache-read-result.interface.js';
import { CacheStore } from '../interfaces/cache-store.interface.js';
import { MemoryCacheEntry } from '../interfaces/memory-cache-entry.interface.js';

/** Entries over this are evicted least recently used first. */
const MAX_ENTRIES = 10_000;
/** Invalidated dependencies remembered one by one; older ones are folded into `tagFloor`. */
const MAX_TAGS = 10_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * CacheStore in process memory (`state.backend=memory`): one process only, nothing is shared. Same revision and tag
 * rules as the Redis scripts, so `AppCacheService` behaves identically on both.
 *
 * Memory is bounded: expired and stale entries are dropped on read and by a sweep every minute (an unref'd timer
 * that starts with the first entry, stops when the store is empty and on shutdown); at most `MAX_ENTRIES` entries,
 * the least recently used one is evicted. Tags are capped too: the oldest are forgotten and their highest revision
 * becomes `tagFloor`, the revision an unknown tag is assumed to have. That can only turn a hit into a miss, never
 * serve a stale value. While `tagFloor` is 0 (fewer than `MAX_TAGS` invalidated dependencies) a missing tag is 0,
 * exactly as in Redis.
 *
 * Time comes from `Date.now()`, so `vi.useFakeTimers()` expires entries.
 */
@Injectable()
export class MemoryCacheStore implements CacheStore, OnApplicationShutdown {
  private revision = 0;
  private tagFloor = 0;
  /** In invalidation order: the first one is the oldest. */
  private readonly tags = new Map<string, number>();
  /** In use order: the first one is the least recently used. */
  private readonly entries = new Map<string, MemoryCacheEntry>();
  private sweepTimer: NodeJS.Timeout | undefined;

  get available(): boolean {
    return true;
  }

  /** Entries currently held, expired ones included until the next read or sweep. */
  get size(): number {
    return this.entries.size;
  }

  read(key: string): Promise<CacheReadResult> {
    const current = this.revision;
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve({ revision: current });
    const ttlMs = entry.expiresAt - Date.now();
    if (ttlMs <= 0 || this.isStale(entry.revision, entry.dependencies)) {
      this.entries.delete(key);
      return Promise.resolve({ revision: current });
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return Promise.resolve({
      revision: current,
      payload: entry.payload,
      ttlMs,
    });
  }

  write(
    key: string,
    revision: number,
    dependencies: readonly string[],
    payload: string,
    ttlMs: number,
  ): Promise<boolean> {
    if (this.isStale(revision, dependencies)) return Promise.resolve(false);
    this.entries.delete(key);
    this.entries.set(key, {
      revision,
      dependencies: [...dependencies],
      payload,
      expiresAt: Date.now() + ttlMs,
    });
    if (this.entries.size > MAX_ENTRIES) this.evictLeastRecentlyUsed();
    this.startSweep();
    return Promise.resolve(true);
  }

  invalidate(dependency: string): Promise<void> {
    // Re-inserted so that the map stays ordered by revision.
    this.tags.delete(dependency);
    this.tags.set(dependency, ++this.revision);
    if (this.tags.size > MAX_TAGS) this.forgetOldestTags();
    return Promise.resolve();
  }

  /** Drops expired and stale entries. */
  sweep(now = Date.now()): void {
    for (const [key, entry] of this.entries)
      if (
        entry.expiresAt <= now ||
        this.isStale(entry.revision, entry.dependencies)
      )
        this.entries.delete(key);
    if (this.entries.size === 0) this.stopSweep();
  }

  onApplicationShutdown(): void {
    this.stopSweep();
  }

  private isStale(revision: number, dependencies: readonly string[]): boolean {
    return (
      revision > this.revision ||
      dependencies.some(
        (dependency) => (this.tags.get(dependency) ?? this.tagFloor) > revision,
      )
    );
  }

  private evictLeastRecentlyUsed(): void {
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  /** Keeps the newer half of the tags; the forgotten ones are remembered only as `tagFloor`. */
  private forgetOldestTags(): void {
    for (const [dependency, revision] of this.tags) {
      if (this.tags.size <= MAX_TAGS / 2) break;
      this.tags.delete(dependency);
      this.tagFloor = Math.max(this.tagFloor, revision);
    }
  }

  private startSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  private stopSweep(): void {
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }
}
