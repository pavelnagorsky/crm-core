import { ThrottlerStorageService } from '@nestjs/throttler';
import { StateBackend } from '../enums/state-backend.enum.js';
import { compileWithStateBackend } from '../state/testing/compile-with-state-backend.js';
import { RedisThrottlerStorage } from './stores/redis-throttler.storage.js';
import { ThrottlerStorageModule } from './throttler-storage.module.js';
import { THROTTLER_STORAGE } from './throttler-storage.token.js';

describe('ThrottlerStorageModule', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('counts in Redis for the redis backend', async () => {
    const app = await compileWithStateBackend(
      ThrottlerStorageModule,
      StateBackend.REDIS,
    );
    expect(app.get(THROTTLER_STORAGE)).toBeInstanceOf(RedisThrottlerStorage);
    await app.close();
  });

  it('counts in memory for the memory backend and clears its timer on shutdown', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const app = await compileWithStateBackend(
      ThrottlerStorageModule,
      StateBackend.MEMORY,
    );
    const storage = app.get<ThrottlerStorageService>(THROTTLER_STORAGE);
    expect(storage).toBeInstanceOf(ThrottlerStorageService);
    await storage.increment('ip', 60_000, 3, 0, 'n');
    expect(vi.getTimerCount()).toBe(1);

    await app.close();

    expect(vi.getTimerCount()).toBe(0);
  });
});
