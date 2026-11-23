import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '../app-cache.service.js';
import { MemoryCacheStore } from '../stores/memory-cache.store.js';

export function createTestCache(enabled = true) {
  return new AppCacheService(
    new MemoryCacheStore(),
    new ConfigService({ cache: { enabled } }),
  );
}
