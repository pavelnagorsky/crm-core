import { ConfigService } from '@nestjs/config';
import { createCache } from 'cache-manager';
import { AppCacheService } from '../app-cache.service.js';

export function createTestCache(enabled = true) {
  return new AppCacheService(
    createCache(),
    new ConfigService({ cache: { enabled } }),
  );
}
