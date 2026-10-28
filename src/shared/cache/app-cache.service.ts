import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Cache } from 'cache-manager';
import { cacheKey } from './cache-key.js';
import { cloneCacheValue } from './clone-cache-value.js';
import { CacheDefinition } from './interfaces/cache-definition.interface.js';
import { CacheEntry } from './interfaces/cache-entry.interface.js';

@Injectable()
export class AppCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly invalidatedAt = new Map<string, number>();
  private revision = 0;
  private stopped = false;
  readonly enabled: boolean;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('cache.enabled', true);
    this.cache.on('refresh', ({ key, error }) => {
      if (error)
        this.logger.warn(`Cache refresh failed: ${key}: ${String(error)}`);
    });
  }

  async getOrLoad<C, V>(
    definition: CacheDefinition<C, V>,
    context: C,
    loader: () => Promise<V>,
  ): Promise<V> {
    if (!this.enabled || this.stopped) return loader();
    const key = cacheKey(definition.namespace, definition.identity(context));
    const read = () =>
      this.cache.wrap<CacheEntry<V>>(
        key,
        async () => {
          const revision = this.revision;
          const value = await loader();
          return {
            value: cloneCacheValue(value),
            dependencies: definition.dependencies(context, value),
            revision,
          };
        },
        {
          ttl: definition.policy.ttlMs,
          refreshThreshold: definition.policy.refreshAheadMs,
        },
      );

    let entry = await read();
    if (!this.isUsable(entry, definition, context)) {
      await this.cache.del(key);
      entry = await read();
    }
    if (this.isUsable(entry, definition, context))
      return cloneCacheValue(entry.value);

    // A second concurrent change should not keep the request in a retry loop.
    await this.cache.del(key);
    return loader();
  }

  private isUsable<C, V>(
    entry: CacheEntry<V>,
    definition: CacheDefinition<C, V>,
    context: C,
  ): boolean {
    // Check after wrap: invalidation can occur during loading or a background write.
    return (
      entry.dependencies.every(
        (dependency) =>
          (this.invalidatedAt.get(dependency) ?? 0) <= entry.revision,
      ) &&
      (!definition.isUsable || definition.isUsable(entry.value, context))
    );
  }

  invalidate(dependency: string): Promise<void> {
    if (this.enabled && !this.stopped) {
      this.invalidatedAt.set(dependency, ++this.revision);
    }
    return Promise.resolve();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.cache.clear();
  }
}
