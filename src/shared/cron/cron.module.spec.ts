import { StateBackend } from '../enums/state-backend.enum.js';
import { compileWithStateBackend } from '../state/testing/compile-with-state-backend.js';
import { CRON_LOCK_STORE } from './cron-lock-store.token.js';
import { CronRunService } from './cron-run.service.js';
import { CronModule } from './cron.module.js';
import { MemoryCronLockStore } from './stores/memory-cron-lock.store.js';
import { RedisCronLockStore } from './stores/redis-cron-lock.store.js';

describe('CronModule', () => {
  afterEach(() => vi.restoreAllMocks());

  it('locks in Redis for the redis backend', async () => {
    const app = await compileWithStateBackend(CronModule, StateBackend.REDIS);
    expect(app.get(CRON_LOCK_STORE)).toBeInstanceOf(RedisCronLockStore);
    await app.close();
  });

  it('locks in memory for the memory backend and registers the runner', async () => {
    const app = await compileWithStateBackend(CronModule, StateBackend.MEMORY);
    expect(app.get(CRON_LOCK_STORE)).toBeInstanceOf(MemoryCronLockStore);
    expect(CronRunService.registered).toBe(app.get(CronRunService));
    await app.close();
    expect(CronRunService.registered).toBeNull();
  });
});
