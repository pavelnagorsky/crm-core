import { Module } from '@nestjs/common';
import { StateBackend } from '../enums/state-backend.enum.js';
import { stateStoreProviders } from '../state/state-store.providers.js';
import { CRON_LOCK_STORE } from './cron-lock-store.token.js';
import { CronLockService } from './cron-lock.service.js';
import { CronRunService } from './cron-run.service.js';
import type { CronLockStore } from './interfaces/cron-lock-store.interface.js';
import { MemoryCronLockStore } from './stores/memory-cron-lock.store.js';
import { RedisCronLockStore } from './stores/redis-cron-lock.store.js';

/** Provides the runner behind `@ExclusiveCron` (lock and metrics); it registers itself, so nothing is exported. */
@Module({
  providers: [
    CronRunService,
    CronLockService,
    ...stateStoreProviders<CronLockStore>(CRON_LOCK_STORE, {
      [StateBackend.MEMORY]: MemoryCronLockStore,
      [StateBackend.REDIS]: RedisCronLockStore,
    }),
  ],
})
export class CronModule {}
