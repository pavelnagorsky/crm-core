import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { REDIS_KEY_PREFIX, RedisService } from './redis.service.js';

type FakeClient = EventEmitter & {
  status: string;
  url: string;
  evalsha: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

function fakeClient(url: string): FakeClient {
  return Object.assign(new EventEmitter(), {
    url,
    status: 'connecting',
    evalsha: vi.fn(),
    eval: vi.fn(),
    quit: vi.fn(async () => 'OK'),
    disconnect: vi.fn(),
  });
}

function createService(url?: string) {
  let client: FakeClient | undefined;
  vi.spyOn(RedisService.prototype as any, 'createClient').mockImplementation(
    (clientUrl) => (client = fakeClient(clientUrl as string)),
  );
  const service = new RedisService(new ConfigService({ redis: { url } }));
  return { service, client };
}

function connect(client: FakeClient) {
  client.status = 'ready';
  client.emit('ready');
}

function drop(client: FakeClient, message = 'ECONNREFUSED') {
  client.status = 'reconnecting';
  client.emit('error', new Error(message));
  client.emit('close');
}

describe('RedisService', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('without REDIS_URL', () => {
    it('creates no client, warns once and is unavailable', async () => {
      const { service, client } = createService(undefined);

      expect(client).toBeUndefined();
      expect(service.available).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('rejects eval', async () => {
      const { service } = createService(undefined);

      await expect(service.eval('return 1', [])).rejects.toThrow(
        'Redis is not configured',
      );
    });
  });

  it('connects with fail-fast options', async () => {
    // A real client to a closed port: only its options are checked.
    const service = new RedisService(
      new ConfigService({ redis: { url: 'redis://127.0.0.1:1' } }),
    );
    const client = (service as any).client as Redis;

    expect(client.options).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 500,
    });
    expect(client.options.keyPrefix).toBeFalsy();
    const ended = new Promise((resolve) => client.once('end', resolve));
    await service.onApplicationShutdown();
    await ended;
  });

  it('is available only while the client is ready', () => {
    const { service, client } = createService('redis://localhost:6379');

    expect(service.available).toBe(false);
    connect(client!);
    expect(service.available).toBe(true);
    drop(client!);
    expect(service.available).toBe(false);
  });

  it('logs only changes of the connection state', () => {
    const { client } = createService('redis://localhost:6379');

    drop(client!);
    drop(client!);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Redis unavailable');

    connect(client!);
    connect(client!);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe('Redis connection restored');

    drop(client!, 'read ECONNRESET');
    drop(client!);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain('Redis connection lost');
    expect(warn.mock.calls[1][0]).toContain('read ECONNRESET');
  });

  it('logs the first connection', () => {
    const { client } = createService('redis://localhost:6379');

    connect(client!);

    expect(log).toHaveBeenCalledWith('Redis connected');
    expect(warn).not.toHaveBeenCalled();
  });

  describe('onModuleInit', () => {
    it('waits for the first connection', async () => {
      const { service, client } = createService('redis://localhost:6379');

      const init = service.onModuleInit();
      connect(client!);

      await expect(init).resolves.toBeUndefined();
      expect(client!.listenerCount('ready')).toBe(1);
    });

    it('does not fail startup when Redis is down', async () => {
      const { service, client } = createService('redis://localhost:6379');

      const init = service.onModuleInit();
      drop(client!);

      await expect(init).resolves.toBeUndefined();
      expect(service.available).toBe(false);
    });

    it('stops waiting after a timeout', async () => {
      vi.useFakeTimers();
      const { service } = createService('redis://localhost:6379');

      const init = service.onModuleInit();
      await vi.advanceTimersByTimeAsync(2500);

      await expect(init).resolves.toBeUndefined();
    });
  });

  describe('eval', () => {
    const script = 'return redis.call("GET", KEYS[1])';
    const sha = createHash('sha1').update(script).digest('hex');

    it('runs the script by its hash', async () => {
      const { service, client } = createService('redis://localhost:6379');
      client!.evalsha.mockResolvedValue('value');

      await expect(service.eval(script, ['crm:a'], [1, 'x'])).resolves.toBe(
        'value',
      );

      expect(client!.evalsha).toHaveBeenCalledWith(sha, 1, 'crm:a', 1, 'x');
      expect(client!.eval).not.toHaveBeenCalled();
    });

    it('sends the script text when Redis does not know it', async () => {
      const { service, client } = createService('redis://localhost:6379');
      client!.evalsha.mockRejectedValue(
        new Error('NOSCRIPT No matching script. Please use EVAL.'),
      );
      client!.eval.mockResolvedValue(42);

      await expect(service.eval(script, ['crm:a', 'crm:b'])).resolves.toBe(42);

      expect(client!.eval).toHaveBeenCalledWith(script, 2, 'crm:a', 'crm:b');
    });

    it('passes other errors through', async () => {
      const { service, client } = createService('redis://localhost:6379');
      client!.evalsha.mockRejectedValue(new Error('Command timed out'));

      await expect(service.eval(script, [])).rejects.toThrow(
        'Command timed out',
      );
      expect(client!.eval).not.toHaveBeenCalled();
    });
  });

  it('prefixes keys', () => {
    const { service } = createService(undefined);

    expect(REDIS_KEY_PREFIX).toBe('crm:');
    expect(service.key('cache', 'tag', 'staff')).toBe('crm:cache:tag:staff');
  });

  describe('onApplicationShutdown', () => {
    it('quits a ready connection without logging it as lost', async () => {
      const { service, client } = createService('redis://localhost:6379');
      connect(client!);

      await service.onApplicationShutdown();
      client!.emit('close');

      expect(client!.quit).toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('disconnects when quit fails', async () => {
      const { service, client } = createService('redis://localhost:6379');
      connect(client!);
      client!.quit.mockRejectedValue(new Error('Connection is closed.'));

      await service.onApplicationShutdown();

      expect(client!.disconnect).toHaveBeenCalled();
    });

    it('stops reconnecting when Redis is down', async () => {
      const { service, client } = createService('redis://localhost:6379');
      drop(client!);

      await service.onApplicationShutdown();

      expect(client!.quit).not.toHaveBeenCalled();
      expect(client!.disconnect).toHaveBeenCalled();
    });
  });
});
