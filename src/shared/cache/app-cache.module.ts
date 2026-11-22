import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { stateStoreProviders } from '../state/state-store.providers.js';
import { AppCacheService } from './app-cache.service.js';
import type { CacheStore } from './interfaces/cache-store.interface.js';
import { CACHE_STORE } from './cache-store.token.js';
import { MemoryCacheStore } from './stores/memory-cache.store.js';
import { RedisCacheStore } from './stores/redis-cache.store.js';

@Module({
  imports: [ConfigModule],
  providers: [
    AppCacheService,
    ...stateStoreProviders<CacheStore>(
      CACHE_STORE,
      MemoryCacheStore,
      RedisCacheStore,
    ),
  ],
  exports: [AppCacheService],
})
export class AppCacheModule {}
