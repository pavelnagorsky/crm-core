import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, RedisOptions } from 'ioredis';
import { AsyncResource } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { IRedisConfig } from '../../config/interfaces/redis-config.interface.js';
import { RedisConnectionState } from './enums/redis-connection-state.enum.js';

/** Set by hand, not with the ioredis `keyPrefix` option: that option does not reach keys built inside Lua. */
const REDIS_KEY_PREFIX = 'klendo:';

/** Commands fail fast instead of waiting for a connection: every caller falls back to working without Redis. */
const CLIENT_OPTIONS: RedisOptions = {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  commandTimeout: 500,
};

/** How long startup waits for the first connection, so the first requests already use Redis. */
const STARTUP_WAIT_MS = 2500;

/**
 * After a command times out while the connection is still open (Redis paused, overloaded, or a network partition
 * without a reset), how often a PING checks whether Redis answers again. Until it does, `available` is false, so
 * callers skip Redis at once instead of each waiting `commandTimeout`.
 */
const PROBE_INTERVAL_MS = 1000;

/** The error ioredis rejects a command with when `commandTimeout` passes. */
const COMMAND_TIMEOUT_MESSAGE = 'Command timed out';

/**
 * The shared Redis connection, used only by the Redis adapters of the state stores (see `stateStoreProviders`).
 * Without `REDIS_URL` there is no client and the memory adapters are used instead. When Redis is down,
 * `available` is false and the Redis adapters work without it (fail-open). ioredis reconnects on its own; only changes of
 * the connection state are logged, not every failed attempt. A Redis that hangs instead of refusing connections keeps
 * the connection open, so the first command timeout also makes `available` false until a PING succeeds: requests pay
 * `commandTimeout` once, not on every Redis call.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;
  private readonly scriptHashes = new Map<string, string>();
  private state = RedisConnectionState.CONNECTING;
  private unresponsive = false;
  private probeTimer: NodeJS.Timeout | undefined;
  private stopped = false;

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
    return this.client?.status === 'ready' && !this.unresponsive;
  }

  /** `klendo:` + parts joined with `:`. */
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
    const params = [...keys, ...args];
    return this.command(async (client) => {
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
    });
  }

  /** `SET key value NX EX ttl`: true when the key was set, false when it already existed. Rejects when Redis is unavailable. */
  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.command((client) =>
      client.set(key, value, 'EX', ttlSeconds, 'NX'),
    );
    return result === 'OK';
  }

  async onApplicationShutdown(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.state = RedisConnectionState.DOWN;
    this.stopped = true;
    clearTimeout(this.probeTimer);
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

  /** Runs a command; a timeout marks Redis unresponsive until a PING succeeds. */
  private async command<T>(run: (client: Redis) => Promise<T>): Promise<T> {
    if (!this.client) throw new Error('Redis is not configured');
    try {
      return await run(this.client);
    } catch (error) {
      if (error instanceof Error && error.message === COMMAND_TIMEOUT_MESSAGE)
        this.onTimeout();
      throw error;
    }
  }

  private onTimeout(): void {
    if (this.unresponsive || this.stopped) return;
    this.unresponsive = true;
    this.logger.warn(
      'Redis is not responding, working without Redis until it answers again',
    );
    this.scheduleProbe();
  }

  /** Bound when the service is built, so probe logs do not carry the requestId of the request that tripped it. */
  private readonly scheduleProbe = AsyncResource.bind((): void => {
    this.probeTimer = setTimeout(() => void this.probe(), PROBE_INTERVAL_MS);
    this.probeTimer.unref();
  });

  private async probe(): Promise<void> {
    this.probeTimer = undefined;
    if (!this.client || !this.unresponsive || this.stopped) return;
    try {
      await this.client.ping();
    } catch {
      if (this.unresponsive && !this.stopped) this.scheduleProbe();
      return;
    }
    if (!this.unresponsive) return;
    this.unresponsive = false;
    this.logger.log('Redis is responding again');
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
    // A new connection answers: whatever hung the old one is gone, and the probe stops on its own.
    this.unresponsive = false;
    if (this.state === RedisConnectionState.UP) return;
    this.logger.log(
      this.state === RedisConnectionState.DOWN
        ? 'Redis connection restored'
        : 'Redis connected',
    );
    this.state = RedisConnectionState.UP;
  }

  private onDown(reason: string): void {
    if (this.state === RedisConnectionState.DOWN) return;
    this.logger.warn(
      this.state === RedisConnectionState.UP
        ? `Redis connection lost, working without Redis until it reconnects: ${reason}`
        : `Redis unavailable, working without Redis until it connects: ${reason}`,
    );
    this.state = RedisConnectionState.DOWN;
  }
}
