import { Logger } from '@nestjs/common';
import { CronLockService } from './cron-lock.service.js';
import { CronLockStore } from './interfaces/cron-lock-store.interface.js';
import { MemoryCronLockStore } from './stores/memory-cron-lock.store.js';

function createStore(acquired = true) {
  return { tryAcquire: vi.fn().mockResolvedValue(acquired) };
}

describe('CronLockService', () => {
  const now = Date.UTC(2026, 10, 22, 12, 30, 45);
  const slot = Math.floor(now / 60_000);

  afterEach(() => vi.restoreAllMocks());

  it('locks the minute slot of the run', async () => {
    const store = createStore();
    const service = new CronLockService(store);

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(true);

    expect(store.tryAcquire).toHaveBeenCalledWith('Jobs.run', slot);
  });

  it('uses one slot for the whole minute', async () => {
    const store = createStore();
    const service = new CronLockService(store);
    const minuteStart = slot * 60_000;

    await service.acquire('Jobs.run', minuteStart);
    await service.acquire('Jobs.run', minuteStart + 59_999);
    await service.acquire('Jobs.run', minuteStart + 60_000);

    expect(store.tryAcquire.mock.calls.map(([, called]) => called)).toEqual([
      slot,
      slot,
      slot + 1,
    ]);
  });

  it('refuses when another process holds the slot and logs at debug', async () => {
    const debug = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    const service = new CronLockService(createStore(false));

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(false);
    expect(debug).toHaveBeenCalledWith(
      'Cron Jobs.run skipped: another process runs it',
    );
  });

  it('runs a cron once per minute with the memory store', async () => {
    const service = new CronLockService(new MemoryCronLockStore());

    await expect(service.acquire('Jobs.run', now)).resolves.toBe(true);
    await expect(service.acquire('Jobs.run', now + 1_000)).resolves.toBe(false);
    await expect(service.acquire('Jobs.run', now + 60_000)).resolves.toBe(true);
  });

  it('registers itself on init and unregisters on destroy', () => {
    const store: CronLockStore = createStore();
    const first = new CronLockService(store);
    const second = new CronLockService(store);

    expect(CronLockService.registered).toBeNull();
    first.onModuleInit();
    expect(CronLockService.registered).toBe(first);
    second.onModuleInit();
    first.onModuleDestroy();
    expect(CronLockService.registered).toBe(second);
    second.onModuleDestroy();
    expect(CronLockService.registered).toBeNull();
  });
});
