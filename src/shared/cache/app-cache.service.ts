import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppCacheMetrics } from './app-cache.metrics.js';
import { cacheKey } from './cache-key.js';
import { CACHE_STORE } from './cache-store.token.js';
import { CacheValueCodec } from './cache-value.codec.js';
import { cloneCacheValue } from './clone-cache-value.js';
import { CacheReadResult } from './enums/cache-read-result.enum.js';
import { CacheDefinition } from './interfaces/cache-definition.interface.js';
import type { CacheStore } from './interfaces/cache-store.interface.js';
import { PendingCacheLoad } from './interfaces/pending-cache-load.interface.js';

/** While the store is down every request fails the same way: warn at most once per interval. */
const STORE_WARNING_INTERVAL_MS = 60_000;

/**
 * Read-through cache shared by all replicas. Fail-open: when the store is unavailable or fails,
 * values are loaded from the database without caching and no request fails because of the cache.
 */
@Injectable()
export class AppCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly loads = new Map<string, PendingCacheLoad>();
  private lastWarningAt = Number.NEGATIVE_INFINITY;
  private stopped = false;
  readonly enabled: boolean;

  constructor(
    @Inject(CACHE_STORE) private readonly store: CacheStore,
    config: ConfigService,
    private readonly metrics: AppCacheMetrics,
  ) {
    this.enabled = config.get<boolean>('cache.enabled', true);
  }

  async getOrLoad<C, V>(
    definition: CacheDefinition<C, V>,
    context: C,
    loader: () => Promise<V>,
  ): Promise<V> {
    if (!this.enabled) return loader();
    const { namespace } = definition;
    if (!this.store.available) {
      this.metrics.read(namespace, CacheReadResult.BYPASS);
      return loader();
    }
    const key = cacheKey(namespace, definition.identity(context));
    let revision: number;
    try {
      const read = await this.store.read(key);
      revision = read.revision;
      if (read.payload !== undefined) {
        const value = CacheValueCodec.decode<V>(read.payload);
        if (!definition.isUsable || definition.isUsable(value, context)) {
          if (
            read.ttlMs !== undefined &&
            read.ttlMs <= definition.policy.refreshAheadMs
          )
            this.refresh(key, definition, context, loader, revision);
          this.metrics.read(namespace, CacheReadResult.HIT);
          // Decoded objects are new on every read: no clone needed.
          return value;
        }
      }
    } catch (error) {
      this.metrics.read(namespace, CacheReadResult.ERROR);
      this.warn(`Cache read failed, loading without cache: ${key}`, error);
      return loader();
    }
    this.metrics.read(namespace, CacheReadResult.MISS);
    return cloneCacheValue(
      await this.load(key, definition, context, loader, revision),
    );
  }

  async invalidate(dependency: string): Promise<void> {
    if (!this.enabled) return;
    if (!this.store.available) {
      this.warn(
        `Cache unavailable, invalidation skipped, stale entries live until TTL: ${dependency}`,
      );
      return;
    }
    try {
      await this.store.invalidate(dependency);
    } catch (error) {
      // The database write is already committed: the request must not fail, staleness is bounded by TTL.
      this.logger.error(
        `Cache invalidation failed, stale entries live until TTL: ${dependency}: ${String(error)}`,
      );
    }
  }

  /** The cache is shared by replicas and is not cleared; only background refreshes stop. */
  onModuleDestroy(): void {
    this.stopped = true;
  }

  /**
   * Joins a load of this process that started from the same or a newer revision. An older load may have
   * read the database before an invalidation the caller already observed, so it is not joined.
   */
  private load<C, V>(
    key: string,
    definition: CacheDefinition<C, V>,
    context: C,
    loader: () => Promise<V>,
    revision: number,
  ): Promise<V> {
    const pending = this.loads.get(key);
    if (pending && pending.revision >= revision)
      return pending.promise as Promise<V>;
    const load: PendingCacheLoad = { revision, promise: Promise.resolve() };
    load.promise = this.loadAndWrite(
      load,
      key,
      definition,
      context,
      loader,
      false,
    ).finally(() => {
      if (this.loads.get(key) === load) this.loads.delete(key);
    });
    this.loads.set(key, load);
    return load.promise as Promise<V>;
  }

  private async loadAndWrite<C, V>(
    load: PendingCacheLoad,
    key: string,
    definition: CacheDefinition<C, V>,
    context: C,
    loader: () => Promise<V>,
    retried: boolean,
  ): Promise<V> {
    const value = await loader();
    if (await this.write(key, definition, context, value, load.revision))
      return value;
    // A second concurrent change should not keep the request in a retry loop.
    if (retried) return loader();

    // Invalidated while loading: load once more from the new revision or join a load that started from it.
    let revision: number;
    try {
      revision = (await this.store.read(key)).revision;
    } catch (error) {
      this.warn(`Cache read failed, loading without cache: ${key}`, error);
      return loader();
    }
    const pending = this.loads.get(key);
    if (pending && pending !== load && pending.revision >= revision)
      return pending.promise as Promise<V>;
    load.revision = revision;
    return this.loadAndWrite(load, key, definition, context, loader, true);
  }

  /** False when the load is stale. A store failure keeps the value uncached but usable. */
  private async write<C, V>(
    key: string,
    definition: CacheDefinition<C, V>,
    context: C,
    value: V,
    revision: number,
  ): Promise<boolean> {
    const dependencies = definition.dependencies(context, value);
    try {
      return await this.store.write(
        key,
        revision,
        dependencies,
        CacheValueCodec.encode(value),
        definition.policy.ttlMs,
      );
    } catch (error) {
      this.warn(`Cache write failed: ${key}`, error);
      return true;
    }
  }

  /** The current value is already returned; a failure leaves it in place until its TTL ends. */
  private refresh<C, V>(
    key: string,
    definition: CacheDefinition<C, V>,
    context: C,
    loader: () => Promise<V>,
    revision: number,
  ): void {
    if (this.stopped) return;
    this.load(key, definition, context, loader, revision).catch(
      (error: unknown) =>
        this.logger.warn(`Cache refresh failed: ${key}: ${String(error)}`),
    );
  }

  private warn(message: string, error?: unknown): void {
    const now = Date.now();
    if (now - this.lastWarningAt < STORE_WARNING_INTERVAL_MS) return;
    this.lastWarningAt = now;
    this.logger.warn(
      error === undefined ? message : `${message}: ${String(error)}`,
    );
  }
}
