import { CacheReadResult } from '../interfaces/cache-read-result.interface.js';
import { CacheStore } from '../interfaces/cache-store.interface.js';
import { MemoryCacheEntry } from '../interfaces/memory-cache-entry.interface.js';

/**
 * In-memory CacheStore for tests with the semantics of the Redis scripts. Time comes from `Date.now()`,
 * so `vi.useFakeTimers()` expires entries. Set `available` to simulate Redis being down.
 */
export class MemoryCacheStore implements CacheStore {
  available = true;
  private revision = 0;
  private readonly tags = new Map<string, number>();
  private readonly entries = new Map<string, MemoryCacheEntry>();

  read(key: string): Promise<CacheReadResult> {
    const current = this.revision;
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve({ revision: current });
    const ttlMs = entry.expiresAt - Date.now();
    if (ttlMs <= 0 || this.isStale(entry.revision, entry.dependencies)) {
      this.entries.delete(key);
      return Promise.resolve({ revision: current });
    }
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
    this.entries.set(key, {
      revision,
      dependencies: [...dependencies],
      payload,
      expiresAt: Date.now() + ttlMs,
    });
    return Promise.resolve(true);
  }

  invalidate(dependency: string): Promise<void> {
    this.tags.set(dependency, ++this.revision);
    return Promise.resolve();
  }

  private isStale(revision: number, dependencies: readonly string[]): boolean {
    return (
      revision > this.revision ||
      dependencies.some(
        (dependency) => (this.tags.get(dependency) ?? 0) > revision,
      )
    );
  }
}
