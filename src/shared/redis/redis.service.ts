import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, RedisOptions } from 'ioredis';
import { createHash } from 'node:crypto';
import { IRedisConfig } from '../../config/interfaces/redis-config.interface.js';

/** Set by hand, not with the ioredis `keyPrefix` option: that option does not reach keys built inside Lua. */
export const REDIS_KEY_PREFIX = 'crm:';

/** Commands fail fast instead of waiting for a connection: every caller falls back to working without Redis. */
const CLIENT_OPTIONS: RedisOptions = {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  commandTimeout: 500,
};

/** How long startup waits for the first connection, so the first requests already use Redis. */
const STARTUP_WAIT_MS = 2500;

type ConnectionState = 'connecting' | 'up' | 'down';

/**
 * The shared Redis connection, used only by the Redis adapters of the state stores (see `stateStoreProviders`).
 * Without `REDIS_URL` there is no client and the memory adapters are used instead. When Redis is down,
 * `available` is false and the Redis adapters work without it (fail-open). ioredis reconnects on its own; only changes of
 * the connection state are logged, not every failed attempt.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private readonly scriptHashes = new Map<string, string>();
  private state: ConnectionState = 'connecting';

  constructor(config: ConfigService) {
    const url = config.get<IRedisConfig>('redis')?.url;
    if (!url) {
      this.client = null;
      this.logger.warn(
        'REDIS_URL is not set: cache, rate limits and cron locks are kept in process memory (single process only)',
      );
      return;
    }
    this.client = this.createClient(url);
    this.client.on('ready', () => this.onReady());
    // Without an 'error' listener ioredis prints every failed reconnect to stderr.
    this.client.on('error', (error: NodeJS.ErrnoException) =>
      // A refused connection on Windows comes as an AggregateError with an empty message.
      this.onDown(error.message || error.code || error.name),
    );
    this.client.on('close', () => this.onDown('connection closed'));
  }

  get available(): boolean {
    return this.client?.status === 'ready';
  }

  /** `crm:` + parts joined with `:`. */
  key(...parts: string[]): string {
    return REDIS_KEY_PREFIX + parts.join(':');
  }

  /** Never fails startup: waits briefly for the first connection and goes on without it. */
  async onModuleInit(): Promise<void> {
    const client = this.client;
    if (!client || this.available) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        client.off('ready', done);
        client.off('error', done);
        resolve();
      };
      const timer = setTimeout(done, STARTUP_WAIT_MS);
      client.once('ready', done);
      client.once('error', done);
    });
  }

  /**
   * Runs a Lua script by its SHA1 (`EVALSHA`) and sends the full text (`EVAL`) only when Redis does not know it
   * yet (`NOSCRIPT`: first call or after a Redis restart). Rejects when Redis is unavailable.
   */
  async eval<T>(
    script: string,
    keys: string[],
    args: (string | number)[] = [],
  ): Promise<T> {
    const client = this.requireClient();
    const params = [...keys, ...args];
    try {
      return (await client.evalsha(
        this.scriptHash(script),
        keys.length,
        ...params,
      )) as T;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('NOSCRIPT'))
        throw error;
      return (await client.eval(script, keys.length, ...params)) as T;
    }
  }

  /** `SET key value NX EX ttl`: true when the key was set, false when it already existed. Rejects when Redis is unavailable. */
  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.requireClient().set(
      key,
      value,
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async onApplicationShutdown(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.state = 'down';
    if (client.status !== 'ready') {
      client.disconnect();
      return;
    }
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  /** Overridden in tests with a fake client. */
  protected createClient(url: string): Redis {
    return new Redis(url, CLIENT_OPTIONS);
  }

  private requireClient(): Redis {
    if (!this.client) throw new Error('Redis is not configured');
    return this.client;
  }

  private scriptHash(script: string): string {
    let hash = this.scriptHashes.get(script);
    if (!hash) {
      hash = createHash('sha1').update(script).digest('hex');
      this.scriptHashes.set(script, hash);
    }
    return hash;
  }

  private onReady(): void {
    if (this.state === 'up') return;
    this.logger.log(
      this.state === 'down' ? 'Redis connection restored' : 'Redis connected',
    );
    this.state = 'up';
  }

  private onDown(reason: string): void {
    if (this.state === 'down') return;
    this.logger.warn(
      this.state === 'up'
        ? `Redis connection lost, working without Redis until it reconnects: ${reason}`
        : `Redis unavailable, working without Redis until it connects: ${reason}`,
    );
    this.state = 'down';
  }
}
