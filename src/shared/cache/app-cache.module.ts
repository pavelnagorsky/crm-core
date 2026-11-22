import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppCacheService } from './app-cache.service.js';
import { CACHE_STORE } from './cache-store.token.js';
import { RedisCacheStore } from './redis-cache.store.js';

@Module({
  imports: [ConfigModule],
  providers: [
    AppCacheService,
    { provide: CACHE_STORE, useClass: RedisCacheStore },
  ],
  exports: [AppCacheService],
})
export class AppCacheModule {}
