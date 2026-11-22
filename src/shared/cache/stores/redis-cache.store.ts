import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';
import { CacheReadResult } from '../interfaces/cache-read-result.interface.js';
import { CacheStore } from '../interfaces/cache-store.interface.js';
import {
  CACHE_INVALIDATE_SCRIPT,
  CACHE_READ_SCRIPT,
  CACHE_WRITE_SCRIPT,
} from './redis-cache.scripts.js';

/**
 * Cache entries and invalidation revisions in Redis, shared by all replicas:
 * `crm:cache:rev` (global counter), `crm:cache:tag:<dependency>` (revision of the last invalidation)
 * and `crm:cache:entry:<key>` (hash with the entry, the only keys with a TTL).
 */
@Injectable()
export class RedisCacheStore implements CacheStore {
  private readonly revisionKey: string;
  private readonly tagPrefix: string;

  constructor(private readonly redis: RedisService) {
    this.revisionKey = redis.key('cache', 'rev');
    this.tagPrefix = redis.key('cache', 'tag', '');
  }

  get available(): boolean {
    return this.redis.available;
  }

  async read(key: string): Promise<CacheReadResult> {
    const [revision, payload, ttlMs] = await this.redis.eval<
      [number, string?, number?]
    >(
      CACHE_READ_SCRIPT,
      [this.entryKey(key), this.revisionKey],
      [this.tagPrefix],
    );
    return payload === undefined ? { revision } : { revision, payload, ttlMs };
  }

  async write(
    key: string,
    revision: number,
    dependencies: readonly string[],
    payload: string,
    ttlMs: number,
  ): Promise<boolean> {
    const written = await this.redis.eval<number>(
      CACHE_WRITE_SCRIPT,
      [this.entryKey(key), this.revisionKey],
      [this.tagPrefix, revision, dependencies.join('\n'), payload, ttlMs],
    );
    return written === 1;
  }

  async invalidate(dependency: string): Promise<void> {
    await this.redis.eval(CACHE_INVALIDATE_SCRIPT, [
      this.revisionKey,
      this.tagPrefix + dependency,
    ]);
  }

  private entryKey(key: string): string {
    return this.redis.key('cache', 'entry', key);
  }
}
