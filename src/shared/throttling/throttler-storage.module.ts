import { Module } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { StateBackend } from '../enums/state-backend.enum.js';
import { stateStoreProviders } from '../state/state-store.providers.js';
import { RedisThrottlerStorage } from './stores/redis-throttler.storage.js';
import { THROTTLER_STORAGE } from './throttler-storage.token.js';

/**
 * Counters of `@nestjs/throttler`: in Redis, or in the built-in in-memory `ThrottlerStorageService` (its sweep
 * timer is unref'd and cleared on shutdown). Imported by `ThrottlerModule.forRootAsync` in AppModule.
 */
@Module({
  providers: stateStoreProviders<ThrottlerStorage>(THROTTLER_STORAGE, {
    [StateBackend.MEMORY]: ThrottlerStorageService,
    [StateBackend.REDIS]: RedisThrottlerStorage,
  }),
  exports: [THROTTLER_STORAGE],
})
export class ThrottlerStorageModule {}
