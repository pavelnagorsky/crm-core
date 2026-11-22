import { ThrottlerStorageService } from '@nestjs/throttler';
import { throttlerStorageContract } from '../testing/throttler-storage.contract.js';

/** The memory adapter is the built-in storage of `@nestjs/throttler`; this proves it matches the Redis one. */
describe('ThrottlerStorageService (memory adapter)', () => {
  let storage: ThrottlerStorageService;

  beforeEach(() => {
    storage = new ThrottlerStorageService();
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    vi.useRealTimers();
  });

  throttlerStorageContract(() => storage);

  it('stops its sweep timer on shutdown, more than once without failing', async () => {
    vi.useFakeTimers();
    await storage.increment('ip', 60_000, 3, 0, 'n');
    expect(vi.getTimerCount()).toBe(1);

    storage.onApplicationShutdown();
    storage.onApplicationShutdown();

    expect(vi.getTimerCount()).toBe(0);
  });
});
