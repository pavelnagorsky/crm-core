import { Module } from '@nestjs/common';
import { StateBackend } from '../enums/state-backend.enum.js';
import { stateStoreProviders } from '../state/state-store.providers.js';
import type { SlidingWindowStore } from './interfaces/sliding-window-store.interface.js';
import { SLIDING_WINDOW_STORE } from './sliding-window-store.token.js';
import { MemorySlidingWindowStore } from './stores/memory-sliding-window.store.js';
import { RedisSlidingWindowStore } from './stores/redis-sliding-window.store.js';

/** Sliding-window counters for domain rate limits, in Redis or in process memory (see `stateStoreProviders`). */
@Module({
  providers: stateStoreProviders<SlidingWindowStore>(SLIDING_WINDOW_STORE, {
    [StateBackend.MEMORY]: MemorySlidingWindowStore,
    [StateBackend.REDIS]: RedisSlidingWindowStore,
  }),
  exports: [SLIDING_WINDOW_STORE],
})
export class RateLimitModule {}
