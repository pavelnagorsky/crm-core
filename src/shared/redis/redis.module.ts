import { Global, Module } from '@nestjs/common';
import { RedisMetrics } from './redis.metrics.js';
import { RedisService } from './redis.service.js';

/** The Redis connection only. Stores built on it live with their features and are the only users of RedisService. */
@Global()
@Module({
  providers: [RedisService, RedisMetrics],
  exports: [RedisService],
})
export class RedisModule {}
