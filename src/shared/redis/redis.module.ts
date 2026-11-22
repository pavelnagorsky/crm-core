import { Global, Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService, RedisThrottlerStorage],
  // RedisThrottlerStorage is injected into ThrottlerModule.forRootAsync in AppModule.
  exports: [RedisService, RedisThrottlerStorage],
})
export class RedisModule {}
